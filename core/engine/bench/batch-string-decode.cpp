// What the applier pays to turn a batch's interned strings back into `std::string`, per OP instead
// of per STRING.
//
// WHY THIS EXISTS. `mutation-buffer.ts` interns every string and states the reason in its own
// comment: a 1 000-row create emits about a dozen distinct view names across 10 000 elements, and
// every prop key is drawn from a set of a few hundred. `SymbioteTree.cpp` does not spend that
// saving. Its `stringAt` is
//
//   auto stringAt = [&](int32_t index) -> std::string {
//     return strings.getValueAtIndex(runtime, (size_t)index).asString(runtime).utf8(runtime);
//   };
//
// called once per op that names a string, never once per string. Counted headless through a real
// adapter (`adapters/solid/src/batch-decode-census.probe.test.tsx`), a 1 000-row Solid create is
// 16 005 of those calls against a strings table of 2 008 entries — 8.0x, and the same 8.0x on
// append.
//
// The second arm is the diagnostic argument. `boundedDynamicFrom` takes `const std::string &what`
// and every caller builds it EAGERLY:
//
//   boundedDynamicFrom(runtime, v, "prop \"" + key + "\" on <" + node->viewName + ">");
//
// for a message that fires only on a cyclic value. Two temporaries and a result per prop write,
// 7 003 times on that same create. It is the class `CLAUDE.md` already records once as "a `dlog`
// ARGUMENT is not gated", which moved Angular's device rows 5.5-25.5%.
//
// WHAT THIS DOES AND DOES NOT PRICE. There is no JSI here, so the `getValueAtIndex` + `asString`
// crossing — likely the larger half of `stringAt` — is NOT modelled. What is modelled is the
// allocation and lookup half, which is the half a decode-once actually removes on top of the
// crossings. Read it as a floor, not as the figure.
//
//   clang++ -std=c++20 -O2 -DNDEBUG core/engine/bench/batch-string-decode.cpp -o /tmp/bsd && /tmp/bsd

#include <chrono>
#include <cstdint>
#include <cstdio>
#include <string>
#include <unordered_map>
#include <vector>

namespace {

// The census's own figures, so the arms are the measured workload and not an invented one.
constexpr int kStringReads = 16005;
constexpr int kDistinctStrings = 2008;
constexpr int kPropWrites = 7003;
constexpr int kRepeats = 40;

using Clock = std::chrono::steady_clock;

double msSince(Clock::time_point from) {
  return std::chrono::duration<double, std::milli>(Clock::now() - from).count();
}

/**
 * The strings table as it reaches the applier.
 *
 * Deliberately a mix of short and long: libc++ stores up to 22 bytes inline, so a table of only
 * short keys would measure a memcpy and report that allocation is free. Real prop keys
 * (`paddingHorizontal`, `onAccessibilityAction`) and view names (`RCTSinglelineTextInputView`)
 * straddle that line, and the long ones are the ones that heap-allocate.
 */
std::vector<std::string> buildTable() {
  static const char *shapes[] = {
      "style",
      "testID",
      "flexDirection",
      "paddingHorizontal",
      "onAccessibilityAction",
      "RCTSinglelineTextInputView",
  };
  std::vector<std::string> table;
  table.reserve(kDistinctStrings);
  for (int at = 0; at < kDistinctStrings; ++at) {
    table.emplace_back(std::string(shapes[at % 6]) + std::to_string(at));
  }
  return table;
}

/** Stands in for `node->props`, so the key is actually USED and cannot be optimised away. */
std::unordered_map<std::string, int> buildProps(
    const std::vector<std::string> &table) {
  std::unordered_map<std::string, int> props;
  for (int at = 0; at < kDistinctStrings; ++at) props[table[at]] = at;
  return props;
}

// TODAY: a fresh `std::string` per op, and the diagnostic built before the call that would need it.
uint64_t perOp(
    const std::vector<std::string> &table,
    const std::unordered_map<std::string, int> &props,
    bool withDiagnostic) {
  uint64_t sink = 0;
  const std::string viewName = "RCTView";
  for (int at = 0; at < kStringReads; ++at) {
    // The copy `stringAt` returns. `utf8()` builds one the same way.
    const std::string key = table[at % kDistinctStrings];
    const auto found = props.find(key);
    if (found != props.end()) sink += static_cast<uint64_t>(found->second);
    if (!withDiagnostic || at >= kPropWrites) continue;
    const std::string what = "prop \"" + key + "\" on <" + viewName + ">";
    sink += what.size();
  }
  return sink;
}

// FIXED: the table decoded once, ops addressing it by reference, the diagnostic composed only where
// it is thrown.
uint64_t perString(
    const std::vector<std::string> &table,
    const std::unordered_map<std::string, int> &props) {
  std::vector<std::string> decoded;
  decoded.reserve(table.size());
  for (const auto &text : table) decoded.push_back(text);

  uint64_t sink = 0;
  for (int at = 0; at < kStringReads; ++at) {
    const std::string &key = decoded[at % kDistinctStrings];
    const auto found = props.find(key);
    if (found != props.end()) sink += static_cast<uint64_t>(found->second);
  }
  return sink;
}

double best(const char *label, uint64_t (*arm)(
    const std::vector<std::string> &,
    const std::unordered_map<std::string, int> &)) {
  const auto table = buildTable();
  const auto props = buildProps(table);
  double lowest = 1e9;
  uint64_t sink = 0;
  for (int round = 0; round < kRepeats; ++round) {
    const auto startedAt = Clock::now();
    sink += arm(table, props);
    const double took = msSince(startedAt);
    if (took < lowest) lowest = took;
  }
  std::printf("%28s  %8.4f ms   (sink %llu)\n", label, lowest,
              static_cast<unsigned long long>(sink % 1000));
  return lowest;
}

uint64_t armToday(
    const std::vector<std::string> &table,
    const std::unordered_map<std::string, int> &props) {
  return perOp(table, props, true);
}

uint64_t armNoDiagnostic(
    const std::vector<std::string> &table,
    const std::unordered_map<std::string, int> &props) {
  return perOp(table, props, false);
}

// ── section 2: the same vocabulary, decoded once per BATCH ─────────────────────────────────────
//
// A read cuts the batch (F-18), and the strings table is per-batch by construction — `takeBatch`
// clears `stringIds`. So an adapter that navigates once per row drains once per row, and every
// drain re-interns the whole fixed vocabulary: `RCTView`, `RCTText`, `style`, `ellipsizeMode`,
// `RCTSinglelineTextInputView` and the rest, over and over.
//
// Measured through the work ledger on the real ten-view row: angular's create interns 11 004
// distinct strings against solid's, vue's and react's 2 011, for a byte-identical tree and a
// byte-identical 48 003-key payload. The repeating intern ORDER is what names the cause.
//
// This arm prices the ALLOCATION half of that difference and nothing else — the JSI crossing per
// decode is not modelled here, and neither is the per-drain `applyOps` call itself. A floor.
constexpr int kAngularStrings = 11004;
constexpr int kSharedVocabulary = 11;

/** Decoding a table once, as `perString` does, at whatever size the fragmentation produced. */
uint64_t decodeTableOfSize(int entries) {
  static const char *shapes[] = {
      "RCTView",
      "RCTText",
      "style",
      "ellipsizeMode",
      "allowFontScaling",
      "RCTSinglelineTextInputView",
  };
  std::vector<std::string> decoded;
  decoded.reserve(static_cast<size_t>(entries));
  uint64_t sink = 0;
  for (int at = 0; at < entries; ++at) {
    // The fixed vocabulary repeats, which is exactly what the fragmented case interns: the same
    // handful of names, once per batch. Only the row-unique text differs, and it is a minority.
    decoded.emplace_back(at % kSharedVocabulary < 6
                             ? std::string(shapes[at % 6])
                             : std::string("row ") + std::to_string(at));
    sink += decoded.back().size();
  }
  return sink;
}

double bestDecode(const char *label, int entries) {
  double lowest = 1e9;
  uint64_t sink = 0;
  for (int round = 0; round < kRepeats; ++round) {
    const auto startedAt = Clock::now();
    sink += decodeTableOfSize(entries);
    const double took = msSince(startedAt);
    if (took < lowest) lowest = took;
  }
  std::printf("%28s  %8.4f ms   (sink %llu)\n", label, lowest,
              static_cast<unsigned long long>(sink % 1000));
  return lowest;
}

} // namespace

int main() {
  std::printf(
      "one 1 000-row solid create: %d string reads over %d distinct strings, %d prop writes\n",
      kStringReads, kDistinctStrings, kPropWrites);
  std::printf("best of %d rounds; no JSI here, so the crossing is NOT priced\n\n", kRepeats);

  const double today = best("today: per-op + diagnostic", armToday);
  const double noDiag = best("per-op, diagnostic gated", armNoDiagnostic);
  const double decoded = best("decoded once, by reference", perString);

  std::printf("\n%28s  %8.4f ms  (%.1f%% of the arm)\n", "the diagnostic alone",
              today - noDiag, (today - noDiag) / today * 100.0);
  std::printf("%28s  %8.4f ms  (%.1f%% of the arm)\n", "the per-op decode alone",
              noDiag - decoded, (noDiag - decoded) / today * 100.0);
  std::printf("%28s  %8.2fx\n", "both, as a ratio", today / decoded);

  std::printf(
      "\n-- the same vocabulary, re-interned once per batch (a read cuts the batch) --\n");
  const double whole = bestDecode("one batch, 2 011 strings", kDistinctStrings);
  const double cut = bestDecode("~1 000 batches, 11 004", kAngularStrings);
  std::printf("%28s  %8.4f ms\n", "what fragmentation costs", cut - whole);
  std::printf(
      "%28s  %s\n", "and what it does NOT price",
      "the JSI crossing per decode, and the per-drain applyOps call");
  return 0;
}
