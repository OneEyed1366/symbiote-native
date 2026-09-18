// What the DEEP prop guard costs when it misses, and how that scales with the payload.
//
// WHY THIS EXISTS. `SymbioteTree.cpp`'s `kOpSetProp` guards every prop write with a full
// `folly::dynamic` comparison:
//
//   auto value = boundedDynamicFrom(runtime, ...);       // needed either way, to store it
//   const auto *existing = node->props.get_ptr(key);
//   if (existing != nullptr && *existing == value) break;
//   node->props[key] = std::move(value);
//
// The reference applier guards with `Object.is`, which for a style object or a handler NEVER fires —
// an adapter hands back a fresh reference on nearly every render. That asymmetry is deliberate and
// the file documents it, correctly, as being in the safe direction for CORRECTNESS: a deep compare
// turns away strictly more writes and cannot turn away a real one.
//
// It is not in the safe direction for COST, and the reference applier is structurally unable to
// show that. `Object.is` on two objects is one pointer comparison and always false; `operator==` on
// two `folly::dynamic` walks both. So a headless run through the applier prices this at zero however
// wide the payload gets, and the only way to see it is to ask folly directly — the same reason
// `dynamic-copy.cpp` and `yoga-relayout.cpp` exist. No JSI, no Fabric, no pod, no simulator.
//
// THE THREE ARMS, and the middle one is the finding:
//
//   NO GUARD       convert and store. What TS effectively does for any object-valued prop.
//   MISS LATE      convert, compare, the values differ in their LAST key, store. The compare walked
//                  the whole payload and bought nothing — one style field changed, which is what a
//                  real update looks like.
//   MISS EARLY     same, differing in the FIRST key. The best case for a miss, and the gap between
//                  it and MISS LATE is the part that scales with payload width.
//   HIT            convert, compare, values equal, skip the store. What the guard is FOR. It is
//                  priced here only to show the compare is not free even when it pays off; the
//                  actual saving is the `markDirty` and subtree rebuild it avoids, which is not
//                  visible from inside folly.
//
// Widths are keys per style object, because that is what `operator==` iterates.

#include <folly/dynamic.h>

#include <chrono>
#include <cstdio>
#include <string>
#include <vector>

namespace {

constexpr int kWrites = 20'000;
constexpr int kRepeats = 5;
constexpr int kWidths[] = {4, 8, 16, 32};

// A style slot shaped the way `routeProp` publishes one: a two-element array, class half and
// explicit half, each an object. The keys and values are ordinary RN style entries — a mix of
// numbers and short strings, since `operator==` costs differently for the two.
folly::dynamic makeStyle(int keys) {
  folly::dynamic classHalf = folly::dynamic::object();
  folly::dynamic explicitHalf = folly::dynamic::object();
  for (int at = 0; at < keys; at += 1) {
    const std::string name = "styleKey" + std::to_string(at);
    if (at % 3 == 0) {
      classHalf[name] = "flex-start";
      explicitHalf[name] = "flex-start";
    } else {
      classHalf[name] = at;
      explicitHalf[name] = at;
    }
  }
  return folly::dynamic::array(std::move(classHalf), std::move(explicitHalf));
}

/** The same style with one entry moved — what a real update hands back. */
folly::dynamic makeStyleChanged(int keys) {
  folly::dynamic style = makeStyle(keys);
  style[0]["styleKey0"] = "changed";
  return style;
}

template <typename TBody>
double timed(TBody &&body) {
  double best = 1e9;
  for (int at = 0; at < kRepeats; at += 1) {
    const auto startedAt = std::chrono::steady_clock::now();
    const auto sink = body();
    const auto elapsed = std::chrono::steady_clock::now() - startedAt;
    // Reading the sink keeps the loop from being optimised away.
    if (sink == 12345678) std::printf(" ");
    const double ms =
        std::chrono::duration<double, std::milli>(elapsed).count();
    if (ms < best) best = ms;
  }
  return best;
}

/**
 * The loop with no comparison in it — the floor every other arm is read against.
 *
 * A first attempt put the whole write path in the loop (copy the incoming value, compare, store).
 * That prices the COPY, which is 10-60x the comparison and swamps it, and it is the wrong question
 * anyway: the copy stands in for the JSI conversion, which every arm pays and neither engine can
 * avoid. What the guard adds is the comparison alone, so that is what this measures.
 */
double runFloor(const folly::dynamic &standing) {
  return timed([&]() {
    long long sink = 0;
    for (int at = 0; at < kWrites; at += 1) sink += standing.size();
    return sink;
  });
}

/**
 * `kWrites` deep copies of the value.
 *
 * Stands in for `boundedDynamicFrom`, which every prop write pays BEFORE the guard can look at
 * anything — the host cannot compare a JSI value against a `folly::dynamic` without building one.
 * Here to put the guard's cost next to the cost it rides on, rather than quoting it alone.
 */
double runCopy(const folly::dynamic &incoming) {
  return timed([&]() {
    long long sink = 0;
    for (int at = 0; at < kWrites; at += 1) {
      folly::dynamic value = incoming;
      sink += static_cast<long long>(value.size());
    }
    return sink;
  });
}

/** `kWrites` comparisons of the standing value against an incoming one. */
double runCompare(
    const folly::dynamic &standing,
    const folly::dynamic &incoming) {
  return timed([&]() {
    long long sink = 0;
    for (int at = 0; at < kWrites; at += 1) sink += standing == incoming ? 1 : 0;
    return sink;
  });
}

}  // namespace

int main() {
  std::printf("%d comparisons, best of %d, ms — TS pays 0 for every column\n\n",
              kWrites, kRepeats);
  std::printf("%8s %8s %10s %10s %10s %12s %12s\n", "keys", "floor", "COPY",
              "MISS", "HIT", "us/copy", "us/hit");

  for (const int keys : kWidths) {
    const folly::dynamic standing = makeStyle(keys);
    // WHICH entry moved is not a control: an object is unordered, so `operator==` bails at an
    // arbitrary point. A first-key / last-key pair was tried and measured the hash order, not depth.
    const folly::dynamic changed = makeStyleChanged(keys);

    const double floor = runFloor(standing);
    const double copy = runCopy(changed);
    const double miss = runCompare(standing, changed);
    const double hit = runCompare(standing, standing);

    std::printf("%8d %8.3f %10.3f %10.3f %10.3f %12.3f %12.3f\n", keys, floor,
                copy, miss, hit, (copy - floor) * 1'000.0 / kWrites,
                (hit - floor) * 1'000.0 / kWrites);
  }
  return 0;
}

// Build (no pod, no simulator, no device — the paths come from an installed example's Pods):
//
//   P=examples/svelte/ios/Pods
//   F=$P/ReactNativeDependencies/framework/packages/react-native/ReactNativeDependencies.xcframework/macos-arm64_x86_64
//   clang++ -std=c++20 -O2 -DNDEBUG \
//     -I$P/Headers/Public/ReactNativeDependencies \
//     -F$F -framework ReactNativeDependencies \
//     -o .docs/prop-guard-compare core/engine/bench/prop-guard-compare.cpp \
//     && .docs/prop-guard-compare
