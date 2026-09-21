// What a node's PROPS cost inside `createNode`, and what a Million-style template would remove.
//
// WHY THIS EXISTS. `BUILD SPLIT` (device, Svelte, Release) reads CREATE 28.7 ms of a 53.5 ms build
// on a 10 000-node create — 54%, the largest cell, and Fabric's rather than ours:
//
//   descriptor lookup · createFamily · cloneProps (the RawProps PARSE) · createInitialState ·
//   createShadowNode + its Yoga node
//
// The perf skill's pre-decided reading of that cell is "stock pays it identically, stop looking".
// That ends the hunt for a DEFICIT. It does not end the hunt for an ADVANTAGE, and those are
// different questions — Million's whole trick on the web is that a static subtree is built once and
// then CLONED, so the per-instance construction never happens at all. The equivalent here is
// sharing `Props`: Fabric props are immutable `shared_ptr<const Props>`, and
// `ConcreteComponentDescriptor::cloneProps` already accepts a BASE props object, so
// "prototype + only the keys that differ" is an API that exists today, not one that needs a fork.
//
// EVERY NODE USES ITS REAL DESCRIPTOR. The row is 3 `RCTView` · 3 `RCTText` · 3 `RCTRawText` · 1
// `RCTSinglelineTextInputView`, and an earlier cut of this file priced all ten as `ViewProps`. That
// is not a rounding error: the hole-carrying nodes are exactly the three `RawText`s (one key each)
// plus the `TextInput`, so charging them `ViewProps` construction mispriced both the baseline and
// the reachable win, in opposite directions. The view name now travels with the payload out of the
// capture probe, and each arm dispatches on it.
//
// TWO GROUPS, and the second is what decides anything. Arms 1-3 isolate the props pipeline, which
// says WHICH lever works. Arms 4-5 build the whole node — `createFamily`, `createInitialState`,
// `createShadowNode` and its Yoga node — with today's props and with a shared prototype, which says
// whether the lever is worth pulling. A props saving is only as interesting as its share of the
// node, and arms 1-3 cannot see the denominator.
//
// WHAT EVEN ARMS 4-5 DO NOT MEASURE: `UIManager::createNode`'s descriptor lookup by view name, and
// the `instanceHandle` it carries. Both are per-instance either way.
//
// A NOTE ON THE HOST. This runs on the Mac, and the device figure it is read against (CREATE
// 28.7 ms) does not. So nothing here may be SUBTRACTED from a device number — only the RATIOS
// transfer, and that is how the result should be quoted.
//
// ── A CORRECTNESS GATE ON ARMS 7-11, upstream of any hash width ──────────────────────────────────
//
// A content-addressed cache assumes the parse is a pure function of the payload. It is not, and
// React Native's own code says so: `fromRawValueShared.h:21` declares
// `SharedColor (*)(const ContextContainer &, int32_t surfaceId, const RawValue &)` and routes any
// value the CSS grammar cannot read into it.
//
//   ios      PlatformColorParser.mm   createSemanticColor / DynamicColor{light,dark,…} — keeps the
//                                     UNRESOLVED form and resolves at draw. Pure today.
//   android  PlatformColorParser.h    getColorFromJava(fabricUIManager, surfaceId, paths) reads the
//                                     ContextContainer and returns a RESOLVED int. RN keys its own
//                                     cache on hashGetColourArguments(surfaceId, paths) — line 26 —
//                                     AND clears it from an appearance-change hook (line 10,
//                                     `configurePlatformColorCacheInvalidationHook`).
//
// So on Android the same payload parses to a different colour in another surface AND after a theme
// change. A payload-only key serves surface A's colour to surface B, silently, one platform, wrong
// colour rather than a crash.
//
// The reach is WIDER than "an opaque colour object": `SymbioteFabricProps.cpp`'s `processColorValue`
// passes through a non-string AND any string it fails to parse, so an unrecognised colour name
// reaches the platform parser too. A refuse-to-cache flag must be set in BOTH pass-through
// branches, not only the object one.
//
// State it with an expiry rather than as a fact: **the cache is correct exactly while nothing
// reachable from `fromRawValueShared` reads the ContextContainer or surfaceId.** iOS clears that
// today, Android does not, and an RN bump can move either.
//
// ── THE ANSWER, measured 2026-09-11, M-series Mac, -O2, best of 12, every node its real type ─────
//
//   1  parse full payload + construct (today)      17.7 ms      per 10 000 nodes
//   2  parse holes only + construct                14.9 ms
//   3  share the props pointer (floor)              0.006 ms
//   4  whole node, props built per node            21.1 ms
//   5  whole node, props shared from prototype      3.0 ms      props are 86% of a node
//   6  props, reachable mix (hole nodes build)      4.3 ms      -76%
//   7  content-addressed cache, real payloads       6.7 ms      -62%, 6 994 hits of 10 000
//   8  same cache, every payload UNIQUE (control)  22.3 ms      0 hits, +26%
//   9  all-miss cache, hash handed to it           22.5 ms
//  10  all-miss cache, no stored payload          20.4 ms
//  11  same cache, every payload IDENTICAL         1.0 ms       9 991 hits
//
//  break-even hit rate 22-27% across runs; below it the cache is slower than doing the work.
//
// **Typing the nodes moved the headline by 9 points and in the direction the mispricing predicted.**
// An earlier cut charged all ten nodes `ViewProps` and read the reachable win as 67%; with the
// three `RawText`s costing what a one-key `RawTextProps` actually costs, it is 76%. The
// hole-carrying nodes are the cheap ones, so mispricing them inflated the baseline and the
// remainder at once.
//

// **Most of building a node is its props, and parsing fewer keys buys almost none of it.** Arm 2 —
// the obvious "template parses only the holes" design — leaves the constructor standing, because
// `RawProps::parse` scales with the payload while the `Props` constructor does not: it reads every
// known prop name whatever the payload contains. Sharing the pointer recovers all of it.
//
// **Arms 3 and 5 are FLOORS, not designs.** They hand the prototype to every node including the
// ones that carry a hole. Arm 6 is the honest ceiling of a compile-time template, and arm 7 — a
// cache keyed on the payload, needing no compiler, no transform and no adapter change — is the
// design that needs none of the five frameworks to cooperate.
//
// The cache's risk is arm 8: where nothing repeats it is arm 1 plus the whole cost of the key, ~26%.
// The split says where that goes, and it is NOT where it was predicted — **the hash is so small its
// sign flips between runs** (+0.6, +0.6, -0.2), while VERIFICATION (the deep `folly::dynamic` copy
// an entry stores so a hit can be checked) and the map itself are ~2 ms each. So accumulating the
// hash incrementally at `kOpSetProp` time buys nothing measurable, and a design that stores no
// payload — a 128-bit fingerprint — buys the most. Arms 8 and 11 bracket the break-even with a
// measured number rather than one extrapolated from arm 7; extrapolation put the all-hit rate at
// ~0.8 ms and it measures 1.0.
//
// The 34-of-38 static split is the benchmark row's, so it is an upper bound
// (`symbiote-perf-measurement`, on lowering ratios).

#include <react/renderer/components/text/ParagraphComponentDescriptor.h>
#include <react/renderer/components/text/ParagraphProps.h>
#include <react/renderer/components/text/RawTextComponentDescriptor.h>
#include <react/renderer/components/text/RawTextProps.h>
#include <react/renderer/components/textinput/TextInputComponentDescriptor.h>
#include <react/renderer/components/textinput/TextInputProps.h>
#include <react/renderer/components/view/ViewComponentDescriptor.h>
#include <react/renderer/components/view/ViewProps.h>
#include <react/renderer/core/PropsParserContext.h>
#include <react/renderer/core/RawProps.h>
#include <react/renderer/core/RawPropsParser.h>
#include <react/renderer/core/ShadowNodeFamily.h>
#include <react/renderer/core/ShadowNodeFragment.h>
#include <react/utils/ContextContainer.h>

#include <folly/dynamic.h>
#include <folly/json.h>

#include <chrono>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

namespace {

using namespace facebook::react;

// The payloads are CAPTURED, not written here — same rule as `dynamic-copy.cpp`, and for the same
// reason: the real row is wildly uneven (10, 3, 1, 1, 2, 1, 4, 3, 1, 12 keys) and a uniform
// stand-in measures a structure the system does not produce.
//
//   SYMBIOTE_PAYLOAD_OUT=/tmp/payloads.json \
//     npx vitest run core/engine/src/__tests__/real-payload.probe.test.ts
//
// captures ten real rows of the benchmark screen — the app's own stylesheet through the real
// parser, the real host behaviors registered — with each node's view name beside its payload.
enum class Kind { View, Paragraph, RawText, TextInput };

Kind kindFor(const std::string &viewName) {
  if (viewName == "RCTText") return Kind::Paragraph;
  if (viewName == "RCTRawText") return Kind::RawText;
  if (viewName == "RCTSinglelineTextInputView" || viewName == "RCTMultilineTextInputView") {
    return Kind::TextInput;
  }
  return Kind::View;
}

struct Capture {
  std::vector<folly::dynamic> payloads;
  std::vector<Kind> kinds;
  int nodesPerRow = 0;
};

Capture loadPayloads(const char *path) {
  std::ifstream file(path);
  if (!file) {
    std::fprintf(stderr, "cannot open %s — run the probe first (see the header)\n", path);
    std::exit(1);
  }
  std::stringstream buffer;
  buffer << file.rdbuf();
  const folly::dynamic parsed = folly::parseJson(buffer.str());
  if (parsed.find("viewNames") == parsed.items().end()) {
    std::fprintf(stderr, "capture has no viewNames — re-run the probe, it writes them now\n");
    std::exit(1);
  }
  Capture out;
  for (const auto &entry : parsed["payloads"]) out.payloads.push_back(entry);
  for (const auto &name : parsed["viewNames"]) out.kinds.push_back(kindFor(name.getString()));
  out.nodesPerRow = static_cast<int>(out.payloads.size()) / 10;
  return out;
}

// WHICH KEYS ARE HOLES IS DERIVED FROM THE CAPTURE, never declared here. Comparing the ten captured
// rows key by key is what says a key is static. Hand-writing that split would be inventing the very
// number the bench exists to price.
struct Split {
  std::vector<folly::dynamic> staticPart;  // per node position
  std::vector<folly::dynamic> holePart;    // per node position
  int staticKeys = 0;
  int holeKeys = 0;
  int holeNodes = 0;
};

Split splitCapture(const Capture &capture) {
  Split split;
  const int perRow = capture.nodesPerRow;
  for (int node = 0; node < perRow; node += 1) {
    folly::dynamic statics = folly::dynamic::object();
    folly::dynamic holes = folly::dynamic::object();
    const folly::dynamic &first = capture.payloads[static_cast<size_t>(node)];
    for (const auto &pair : first.items()) {
      bool same = true;
      for (int row = 1; row < 10; row += 1) {
        const folly::dynamic &other =
            capture.payloads[static_cast<size_t>(row * perRow + node)];
        const auto found = other.find(pair.first);
        if (found == other.items().end() || found->second != pair.second) {
          same = false;
          break;
        }
      }
      if (same) {
        statics[pair.first] = pair.second;
        split.staticKeys += 1;
      } else {
        holes[pair.first] = pair.second;
        split.holeKeys += 1;
      }
    }
    if (!holes.empty()) split.holeNodes += 1;
    split.staticPart.push_back(std::move(statics));
    split.holePart.push_back(std::move(holes));
  }
  return split;
}

// One prepared parser and one descriptor per concrete type. `prepare<T>()` memoises the prop-name
// table, so preparing inside an arm would measure the table build and not the parse.
struct Registry {
  RawPropsParser viewParser, paragraphParser, rawTextParser, textInputParser;
  ViewComponentDescriptor view;
  ParagraphComponentDescriptor paragraph;
  RawTextComponentDescriptor rawText;
  TextInputComponentDescriptor textInput;

  explicit Registry(const ComponentDescriptorParameters &params)
      : view(params), paragraph(params), rawText(params), textInput(params) {
    viewParser.prepare<ViewProps>();
    paragraphParser.prepare<ParagraphProps>();
    rawTextParser.prepare<RawTextProps>();
    textInputParser.prepare<TextInputProps>();
  }

  RawPropsParser &parserFor(Kind kind) {
    switch (kind) {
      case Kind::Paragraph: return paragraphParser;
      case Kind::RawText: return rawTextParser;
      case Kind::TextInput: return textInputParser;
      case Kind::View: break;
    }
    return viewParser;
  }

  const ComponentDescriptor &descriptorFor(Kind kind) const {
    switch (kind) {
      case Kind::Paragraph: return paragraph;
      case Kind::RawText: return rawText;
      case Kind::TextInput: return textInput;
      case Kind::View: break;
    }
    return view;
  }
};

// Reads a real field of each concrete type so no arm can be optimised away, and reads the SAME
// field for a given node in every arm — so two arms over the same pool must report the same guard.
//
// Arms 3 and 5 are the deliberate exception and their guard is LOWER: a prototype is built from the
// static keys only, so a `RawText`'s `text` is absent and drains to 0. That is the floor doing
// exactly what it claims — ignoring the holes — and a guard equal to arm 1's there would mean the
// floor was not a floor.
long long drain(Kind kind, const Props &props) {
  switch (kind) {
    case Kind::Paragraph:
      return static_cast<const ParagraphProps &>(props).paragraphAttributes.maximumNumberOfLines;
    case Kind::RawText:
      return static_cast<long long>(static_cast<const RawTextProps &>(props).text.size());
    case Kind::TextInput:
      return static_cast<long long>(static_cast<const TextInputProps &>(props).text.size());
    case Kind::View:
      break;
  }
  const auto &view = static_cast<const ViewProps &>(props);
  return static_cast<long long>(view.opacity * 1000.0) +
      static_cast<long long>(view.nativeId.size());
}

// Parse a payload and construct props of the right concrete type, optionally against a base — which
// is `cloneProps`'s own shape, and what arm 2 uses to parse only the holes.
// `Props`'s copy constructor is DELETED, so the base has to reach the constructor as a reference —
// a `base ? *base : P{}` ternary materialises a copy and will not compile. The default instance is
// a function-local static for the same reason, and it is also the honest arm: constructing a fresh
// empty `P` per node would charge every arm for a constructor `cloneProps` does not run.
template <typename P>
std::shared_ptr<const Props> makeProps(
    PropsParserContext &context, const Props *base, const RawProps &raw) {
  static const P kEmpty{};
  return std::make_shared<const P>(
      context, base != nullptr ? static_cast<const P &>(*base) : kEmpty, raw);
}

std::shared_ptr<const Props> buildProps(
    Kind kind,
    Registry &registry,
    PropsParserContext &context,
    const folly::dynamic &payload,
    const Props *base) {
  RawProps raw{folly::dynamic(payload)};
  raw.parse(registry.parserFor(kind));
  switch (kind) {
    case Kind::Paragraph: return makeProps<ParagraphProps>(context, base, raw);
    case Kind::RawText: return makeProps<RawTextProps>(context, base, raw);
    case Kind::TextInput: return makeProps<TextInputProps>(context, base, raw);
    case Kind::View: break;
  }
  return makeProps<ViewProps>(context, base, raw);
}

constexpr int NODES = 10000;
constexpr int REPEATS = 12;

template <typename Body>
double best(const char *label, Body body) {
  double bestMs = 1e9;
  long long guard = 0;
  for (int run = 0; run < REPEATS; run += 1) {
    const auto started = std::chrono::steady_clock::now();
    guard = body();
    const auto finished = std::chrono::steady_clock::now();
    const double ms = std::chrono::duration<double, std::milli>(finished - started).count();
    if (ms < bestMs) bestMs = ms;
  }
  // min, not mean: the same rule the JS benches here follow — allocation-bound work has a long tail
  // and the floor is the reproducible number.
  std::printf("%-44s %8.3f ms   (guard %lld)\n", label, bestMs, guard);
  return bestMs;
}

// The entry carries its KIND as well as its payload, and the hit check compares both. Keying on
// `(kind, payload)` is not enough on its own: a hash collision between two kinds lands on one key,
// and a check that verifies only the payload would then hand a `RawTextProps` back for a `ViewProps`
// node. Vanishingly unlikely and a correctness bug rather than a slow path, which is the same reason
// the entry stores a payload at all.
struct CacheEntry {
  Kind kind;
  folly::dynamic payload;
  std::shared_ptr<const Props> props;
};

}  // namespace

int main(int argc, char **argv) {
  const Capture capture = loadPayloads(argc > 1 ? argv[1] : "/tmp/payloads.json");
  const Split split = splitCapture(capture);
  const int perRow = capture.nodesPerRow;

  auto contextContainer = std::make_shared<const ContextContainer>();
  PropsParserContext context{1, *contextContainer};
  ComponentDescriptorParameters descriptorParams{EventDispatcher::Weak{}, contextContainer, nullptr};
  Registry registry{descriptorParams};

  // THE POOL'S DISTINCTNESS IS THE WHOLE EXPERIMENT for arm 7, and two earlier cuts of it both
  // flattered the cache. The first indexed the capture by node POSITION only, so all 10 000
  // payloads came from row 0 and the `text` that varies never entered — 9 991 hits of 10 000, a
  // cache measuring its own input. The second re-derived every hole as `to_string(row)`, giving two
  // nodes of one row the same value and collapsing two distinct payloads into one.
  //
  // The hole value is now the CAPTURED one with the replay cycle appended, so whatever within-row
  // collisions the app actually has are preserved and each cycle is distinct the way a 1 000-row
  // create is.
  std::vector<folly::dynamic> fullPool, holePool;
  fullPool.reserve(NODES);
  holePool.reserve(NODES);
  for (int id = 0; id < NODES; id += 1) {
    const int node = id % perRow;
    const int row = id / perRow;
    folly::dynamic payload = capture.payloads[static_cast<size_t>((row % 10) * perRow + node)];
    folly::dynamic holes = split.holePart[static_cast<size_t>(node)];
    const std::string cycle = "#" + std::to_string(row / 10);
    for (const auto &pair : split.holePart[static_cast<size_t>(node)].items()) {
      const auto captured = payload.find(pair.first);
      if (captured == payload.items().end() || !captured->second.isString()) continue;
      folly::dynamic value = folly::dynamic(captured->second.getString() + cycle);
      payload[pair.first] = value;
      holes[pair.first] = value;
    }
    fullPool.push_back(std::move(payload));
    holePool.push_back(std::move(holes));
  }

  // One prototype per node POSITION, built from the static keys only and with that position's own
  // descriptor. In a real template this is what a compiler would emit once per call site.
  std::vector<std::shared_ptr<const Props>> prototypes;
  for (int node = 0; node < perRow; node += 1) {
    prototypes.push_back(buildProps(
        capture.kinds[static_cast<size_t>(node)], registry, context,
        split.staticPart[static_cast<size_t>(node)], nullptr));
  }

  int views = 0, paragraphs = 0, rawTexts = 0, textInputs = 0;
  for (int node = 0; node < perRow; node += 1) {
    switch (capture.kinds[static_cast<size_t>(node)]) {
      case Kind::View: views += 1; break;
      case Kind::Paragraph: paragraphs += 1; break;
      case Kind::RawText: rawTexts += 1; break;
      case Kind::TextInput: textInputs += 1; break;
    }
  }
  std::printf(
      "captured %zu payloads, %d nodes/row: %d View · %d Paragraph · %d RawText · %d TextInput\n"
      "per row: %d static keys, %d hole keys on %d of %d nodes\n"
      "replayed to %d nodes, best of %d\n\n",
      capture.payloads.size(), perRow, views, paragraphs, rawTexts, textInputs, split.staticKeys,
      split.holeKeys, split.holeNodes, perRow, NODES, REPEATS);

  // ARM 1 — today. What `cloneProps` does per created node: parse the whole payload, then construct
  // `Props` against a default base.
  const double today = best("1  parse full payload + construct (today)", [&] {
    long long sum = 0;
    for (int id = 0; id < NODES; id += 1) {
      const Kind kind = capture.kinds[static_cast<size_t>(id % perRow)];
      sum += drain(kind, *buildProps(kind, registry, context, fullPool[static_cast<size_t>(id)], nullptr));
    }
    return sum;
  });

  // ARM 2 — a template that still constructs per node: the prototype is the base, and only the keys
  // that actually differ between rows are parsed.
  const double holesOnly = best("2  parse holes only + construct", [&] {
    long long sum = 0;
    for (int id = 0; id < NODES; id += 1) {
      const int node = id % perRow;
      const Kind kind = capture.kinds[static_cast<size_t>(node)];
      sum += drain(
          kind,
          *buildProps(
              kind, registry, context, holePool[static_cast<size_t>(id)],
              prototypes[static_cast<size_t>(node)].get()));
    }
    return sum;
  });

  // ARM 3 — the floor. The node takes the prototype's props pointer and constructs nothing. Only
  // reachable for a node with NO holes.
  const double shared = best("3  share the props pointer (floor)", [&] {
    long long sum = 0;
    for (int id = 0; id < NODES; id += 1) {
      const int node = id % perRow;
      sum += drain(capture.kinds[static_cast<size_t>(node)], *prototypes[static_cast<size_t>(node)]);
    }
    return sum;
  });

  std::printf(
      "\nparse of the static keys, removable by a template:  %.3f ms per %d nodes\n"
      "the Props CONSTRUCTOR, removable only by sharing:   %.3f ms\n"
      "both, against the floor:                            %.3f ms\n\n",
      today - holesOnly, NODES, holesOnly - shared, today - shared);

  // ── GROUP 2: the whole node, which is what supplies the denominator ────────────────────────────
  const double nodeToday = best("4  whole node, props built per node", [&] {
    long long sum = 0;
    for (int id = 0; id < NODES; id += 1) {
      const Kind kind = capture.kinds[static_cast<size_t>(id % perRow)];
      const ComponentDescriptor &descriptor = registry.descriptorFor(kind);
      auto family = descriptor.createFamily({Tag{id + 2}, SurfaceId{1}, nullptr});
      auto props = descriptor.cloneProps(
          context, nullptr, RawProps{folly::dynamic(fullPool[static_cast<size_t>(id)])});
      auto state = descriptor.createInitialState(props, family);
      auto node = descriptor.createShadowNode(
          ShadowNodeFragment{props, ShadowNode::emptySharedShadowNodeSharedList(), state}, family);
      sum += node->getTag();
    }
    return sum;
  });

  // ARM 5 — a template: the node takes the prototype's props pointer. Everything else is identical,
  // so the delta against arm 4 IS the props share of building a node.
  const double nodeShared = best("5  whole node, props shared from prototype", [&] {
    long long sum = 0;
    for (int id = 0; id < NODES; id += 1) {
      const int node = id % perRow;
      const ComponentDescriptor &descriptor = registry.descriptorFor(capture.kinds[static_cast<size_t>(node)]);
      auto family = descriptor.createFamily({Tag{id + 2}, SurfaceId{1}, nullptr});
      const Props::Shared props = prototypes[static_cast<size_t>(node)];
      auto state = descriptor.createInitialState(props, family);
      auto shadowNode = descriptor.createShadowNode(
          ShadowNodeFragment{props, ShadowNode::emptySharedShadowNodeSharedList(), state}, family);
      sum += shadowNode->getTag();
    }
    return sum;
  });

  std::printf(
      "\nprops share of building a node:  %.3f ms of %.3f ms  (%.0f%%)\n"
      "the rest — family, state, ShadowNode, Yoga — is per-instance whatever we do\n\n",
      nodeToday - nodeShared, nodeToday,
      100.0 * (nodeToday - nodeShared) / nodeToday);

  // ── GROUP 3: what is REACHABLE, and what identifying a prototype costs ─────────────────────────
  //
  // Arms 3 and 5 are floors, not designs: they hand the prototype to every node, including the ones
  // that carry a hole. Arm 6 is the honest mix, MEASURED rather than blended on paper — a blend
  // assumes the two rates compose, and that is the assumption worth spending an arm on.
  const double reachable = best("6  props, reachable mix (hole nodes build)", [&] {
    long long sum = 0;
    for (int id = 0; id < NODES; id += 1) {
      const int node = id % perRow;
      const Kind kind = capture.kinds[static_cast<size_t>(node)];
      if (split.holePart[static_cast<size_t>(node)].empty()) {
        sum += drain(kind, *prototypes[static_cast<size_t>(node)]);
        continue;
      }
      sum += drain(
          kind,
          *buildProps(
              kind, registry, context, holePool[static_cast<size_t>(id)],
              prototypes[static_cast<size_t>(node)].get()));
    }
    return sum;
  });

  // ARMS 7-11 — where a PROTOTYPE COMES FROM, which every arm above assumes is free.
  //
  // Million derives one at compile time from a call site. This architecture has no call site in
  // C++: a node arrives as a stream of `kOpSetProp` ops with no statement that it resembles the
  // last one. The shape that needs no compiler, no transform and no adapter change is a
  // content-addressed cache, and it is only a lever if the KEY costs less than the construction it
  // skips.
  //
  // The hash is `folly::dynamic::hash()`, the library's own, and a hit is VERIFIED by comparing the
  // payload: a cache that trusts a 64-bit hash alone commits the wrong props on a collision, which
  // is a correctness bug, not a trade-off. The map starts COLD each run — conservative, since a
  // real cache would persist across commits.
  //
  // The cache is keyed on the payload AND the kind: two different components can carry byte-equal
  // payloads (`{text: "…"}` on a RawText and on a TextInput) and must not share parsed props.
  auto runCache = [&](const std::vector<folly::dynamic> &pool, long long *hitCount) {
    long long sum = 0;
    long long hits = 0;
    std::unordered_map<size_t, CacheEntry> cache;
    for (int id = 0; id < NODES; id += 1) {
      const int node = id % perRow;
      const Kind kind = capture.kinds[static_cast<size_t>(node)];
      const folly::dynamic &payload = pool[static_cast<size_t>(id)];
      const size_t key = payload.hash() * 31 + static_cast<size_t>(kind);
      const auto found = cache.find(key);
      if (found != cache.end() && found->second.kind == kind && found->second.payload == payload) {
        hits += 1;
        sum += drain(kind, *found->second.props);
        continue;
      }
      auto props = buildProps(kind, registry, context, payload, nullptr);
      sum += drain(kind, *props);
      cache[key] = CacheEntry{kind, payload, std::move(props)};
    }
    if (hitCount != nullptr) *hitCount = hits;
    return sum;
  };

  long long realHits = 0;
  const double cached =
      best("7  content-addressed cache, real payloads", [&] { return runCache(fullPool, &realHits); });

  // ARM 8 — the negative control, and the arm that decides whether this is safe to ship. Every
  // payload is unique, so the cache NEVER hits and the run is arm 1 plus the whole cost of the key.
  // A real screen is nothing like 1 000 identical rows, and the benchmark row is exactly where a
  // cache flatters itself. Key COUNT is held equal to arm 7 — only one value differs per node.
  //
  // The unique value goes into `testID`, and getting there took two wrong attempts worth recording:
  // a real payload's values are TYPED and most of its strings are GRAMMARS. Writing a string over
  // the first key aborted inside `RawProps::parse` on a numeric prop; suffixing the first STRING
  // key then produced `flexDirection: "rowu0"` and `alignItems: "centeru6"`, which RN logged and
  // refused. Both aborted at arm 8 AFTER three arms had printed, which reads as a bench that worked.
  //
  // `testID` is free-form, exists on every Props, and none of these payloads carries it — so this
  // adds one key per node rather than mutating one. Arm 8 therefore hashes one key more than arm 7,
  // ~3% of this row's average; it inflates the measured miss cost slightly and cannot flatter it.
  std::vector<folly::dynamic> uniquePool;
  uniquePool.reserve(NODES);
  for (int id = 0; id < NODES; id += 1) {
    folly::dynamic copy = fullPool[static_cast<size_t>(id)];
    copy["testID"] = "u" + std::to_string(id);
    uniquePool.push_back(std::move(copy));
  }
  long long missHits = 0;
  const double cacheMisses = best(
      "8  same cache, every payload UNIQUE (control)", [&] { return runCache(uniquePool, &missHits); });

  // ARM 9 — the same all-miss control with the hash HANDED TO IT, and ARM 10 with no stored payload.
  // 8 minus 9 is what `folly::dynamic::hash()` costs; 9 minus 10 is what VERIFICATION costs, which
  // is a deep `folly::dynamic` copy per miss. The split decides which cheap variant is worth
  // building — and neither is derivable, because a dynamic hash walks a map while a lookup is one
  // probe.
  std::vector<size_t> precomputed;
  precomputed.reserve(NODES);
  for (int id = 0; id < NODES; id += 1) {
    precomputed.push_back(
        uniquePool[static_cast<size_t>(id)].hash() * 31 +
        static_cast<size_t>(capture.kinds[static_cast<size_t>(id % perRow)]));
  }

  const double cacheNoHash = best("9  all-miss cache, hash handed to it", [&] {
    long long sum = 0;
    std::unordered_map<size_t, CacheEntry> cache;
    for (int id = 0; id < NODES; id += 1) {
      const Kind kind = capture.kinds[static_cast<size_t>(id % perRow)];
      const folly::dynamic &payload = uniquePool[static_cast<size_t>(id)];
      const auto found = cache.find(precomputed[static_cast<size_t>(id)]);
      if (found != cache.end() && found->second.kind == kind && found->second.payload == payload) {
        sum += drain(kind, *found->second.props);
        continue;
      }
      auto props = buildProps(kind, registry, context, payload, nullptr);
      sum += drain(kind, *props);
      cache[precomputed[static_cast<size_t>(id)]] = CacheEntry{kind, payload, std::move(props)};
    }
    return sum;
  });

  // ARM 10 is NOT a proposal — trusting a 64-bit hash commits the wrong props on a collision. It
  // exists to say whether a design that avoids the copy honestly (a 128-bit fingerprint, no stored
  // payload) is worth drawing up.
  const double cacheNoVerify = best("10 all-miss cache, no stored payload", [&] {
    long long sum = 0;
    std::unordered_map<size_t, std::shared_ptr<const Props>> cache;
    for (int id = 0; id < NODES; id += 1) {
      const Kind kind = capture.kinds[static_cast<size_t>(id % perRow)];
      const folly::dynamic &payload = uniquePool[static_cast<size_t>(id)];
      const size_t key = payload.hash() * 31 + static_cast<size_t>(kind);
      const auto found = cache.find(key);
      if (found != cache.end()) {
        sum += drain(kind, *found->second);
        continue;
      }
      auto props = buildProps(kind, registry, context, payload, nullptr);
      sum += drain(kind, *props);
      cache[key] = std::move(props);
    }
    return sum;
  });

  // ARM 11 — the other end: every payload IDENTICAL per node position, so the cache hits every time
  // after the first. With arm 8 this pins the break-even hit rate, which is otherwise derived from
  // arm 7 by assuming the two rates compose linearly — the assumption arm 6 exists to stop making.
  std::vector<folly::dynamic> samePool;
  samePool.reserve(NODES);
  for (int id = 0; id < NODES; id += 1) {
    samePool.push_back(capture.payloads[static_cast<size_t>(id % perRow)]);
  }
  long long allHits = 0;
  const double cacheAllHit = best(
      "11 same cache, every payload IDENTICAL", [&] { return runCache(samePool, &allHits); });

  // The guards differ between pools by construction, so the CONTROL here is the hit count, printed
  // rather than assumed. 0 hits on arm 8 is what says it priced a miss and not a warm cache that
  // happened to be slow; ~10 000 on arm 11 says the same in the other direction.
  std::printf(
      "\narm 7 hits %lld · arm 8 hits %lld · arm 11 hits %lld   (of %d)\n"
      "reachable props win:        %.3f ms of %.3f ms  (%.0f%%)\n"
      "cache at arm 7's hit rate:  %.3f ms of %.3f ms  (%.0f%%)\n"
      "cache overhead on a MISS:   %.3f ms — arm 8 against arm 1\n"
      "   of which the HASH:       %.3f ms — arm 8 against arm 9\n"
      "   of which VERIFICATION:   %.3f ms — arm 9 against arm 10\n"
      "   of which lookup+insert:  %.3f ms — arm 10 against arm 1\n"
      "break-even hit rate:        %.0f%% — below it the cache is SLOWER than today\n",
      realHits, missHits, allHits, NODES,
      today - reachable, today, 100.0 * (today - reachable) / today,
      today - cached, today, 100.0 * (today - cached) / today,
      cacheMisses - today, cacheMisses - cacheNoHash, cacheNoHash - cacheNoVerify,
      cacheNoVerify - today,
      100.0 * (cacheMisses - today) / (cacheMisses - cacheAllHit));
  return 0;
}

// Build and run — no pod install, no simulator, no device. The headers and the prebuilt binary come
// from an installed example's Pods, and the slice is maccatalyst because that is the one that runs
// natively on an Apple Silicon Mac. `jsi` is compiled from the vendored source because it is not in
// `React.framework`.
//
//   cd examples/solid/ios/Pods
//   V=../../../../.vendors/react-native/packages/react-native/ReactCommon/jsi/jsi
//   R=$PWD/React-Core-prebuilt/React.xcframework/ios-arm64_x86_64-maccatalyst
//   D=$PWD/ReactNativeDependencies/framework/packages/react-native/ReactNativeDependencies.xcframework/ios-arm64_x86_64-maccatalyst
//   H=$PWD/hermes-engine/destroot/Library/Frameworks/universal/hermesvm.xcframework/ios-arm64_x86_64-maccatalyst
//   clang++ -std=c++20 -O2 -DNDEBUG -target arm64-apple-ios16.0-macabi \
//     -IHeaders/Private/Yoga -IHeaders/Public/React-Fabric -IHeaders/Public/React-FabricComponents \
//     -IHeaders/Public/React-Core -IHeaders/Public/ReactNativeDependencies \
//     -IHeaders/Public/React-debug -IHeaders/Public/RCTRequired -IHeaders/Public/React-utils \
//     -IHeaders/Public/React-graphics -IHeaders/Public/Yoga -IHeaders/Public/React-jsi \
//     -IHeaders/Public/React-renderercss -IHeaders/Public/React-featureflags \
//     -IHeaders/Public/React-rendererdebug -IHeaders/Public/React-runtimescheduler \
//     -IHeaders/Public/React-cxxreact -IHeaders/Public/React-Mapbuffer \
//     -IHeaders/Public/React-timing -IHeaders/Public/RCTTypeSafety \
//     -F$R -F$D -framework React -framework ReactNativeDependencies \
//     -Wl,-rpath,$R -Wl,-rpath,$D -Wl,-rpath,$H \
//     -o /tmp/props-construction ../../../../core/engine/bench/props-construction.cpp \
//     $V/jsi.cpp $V/JSIDynamic.cpp && /tmp/props-construction
