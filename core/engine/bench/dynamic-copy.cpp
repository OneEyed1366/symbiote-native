// What the REDUNDANT props copy costs, priced against folly alone.
//
// WHY THIS EXISTS. `SymbioteTree.cpp`'s create path builds the payload once and then copies it
// twice:
//
//   const folly::dynamic payload = fabricProps(...);      // 1  build
//   react::RawProps(folly::dynamic(payload))              // 2  explicit COPY
//   node.committedProps = payload;                        // 3  COPY
//
// Only one copy is required — `committedProps` must outlive the call, because the next commit's
// `diffProps` reads it. The other is removable: `RawProps.h:65` declares
// `explicit RawProps(folly::dynamic dynamic)`, i.e. BY VALUE, so the payload can be moved in once
// `committedProps` has its copy. That is a reading of a header, not a measurement, and a reading
// does not say whether the copy is worth removing — hence this.
//
// Folly is the right place to ask, for the same reason `yoga-relayout.cpp` asks Yoga: the question
// is about `folly::dynamic` and nothing else, so it needs no Fabric, no JSI, no pod, no simulator
// and no device. Build and run it with one clang++ invocation (see the recipe at the bottom).
//
// THE CONTROL IS THE POINT. Arm 1 does the build and no copies at all. If arms 1 and 2 read the
// same, the copies are free, the reading above is irrelevant, and the answer is "do not bother" —
// which is a result. Without that arm, a small delta between arms 2 and 3 is unreadable.

#include <folly/dynamic.h>
#include <folly/json.h>

#include <chrono>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

namespace {

// The payloads are CAPTURED, not written here. The first version of this file invented a uniform
// 5-key payload and measured a structure the system does not produce: the real row is 40%
// single-key nodes with two fat ones, and an average hides that completely.
//
//   npx vitest run core/engine/src/__tests__/real-payload.probe.test.ts
//
// writes the committed payloads of ten real rows — the app's own stylesheet through the real
// parser, the real host behaviors registered — and this reads them back. Ten rows is one period of
// the pattern; the bench repeats it to reach benchmark size.
std::vector<folly::dynamic> loadPayloads(const char *path) {
  std::ifstream file(path);
  if (!file) {
    std::fprintf(stderr, "cannot open %s — run the probe first\n", path);
    std::exit(1);
  }
  std::stringstream buffer;
  buffer << file.rdbuf();
  const folly::dynamic parsed = folly::parseJson(buffer.str());
  std::vector<folly::dynamic> out;
  for (const auto &entry : parsed["payloads"]) out.push_back(entry);
  return out;
}

// Reads every leaf so neither the build nor a copy can be optimised away. Returning a value the
// caller prints is what keeps the whole loop alive under -O2.
long long drain(const folly::dynamic &props) {
  long long sum = 0;
  for (const auto &pair : props.items()) {
    sum += static_cast<long long>(pair.first.size());
    const folly::dynamic &value = pair.second;
    if (value.isInt()) sum += value.asInt();
    else if (value.isDouble()) sum += static_cast<long long>(value.asDouble());
    else if (value.isString()) sum += static_cast<long long>(value.getString().size());
  }
  return sum;
}

constexpr int NODES = 10001;
constexpr int REPEATS = 12;

std::vector<folly::dynamic> captured;

// The captured set is one row-period; cycling it reaches benchmark size while keeping the real
// distribution — which is the whole point, since the payloads are wildly uneven.
const folly::dynamic &payloadFor(int index) {
  return captured[static_cast<size_t>(index) % captured.size()];
}

// `body` receives a pool of OWNED payloads built OUTSIDE the clock. That is not a convenience: the
// arm under test differs by whether it MOVES its payload, and a move destroys the source, so an arm
// that re-copies from a shared capture on every iteration pays a copy the other one also pays and
// the two arms become identical. Measured — the first version of this file did exactly that and
// reported the difference as 0.019 ms, which is what two identical arms always report.
template <typename Body>
double best(const char *label, Body body) {
  double bestMs = 1e9;
  long long guard = 0;
  for (int run = 0; run < REPEATS; run += 1) {
    std::vector<folly::dynamic> pool;
    pool.reserve(NODES);
    for (int id = 0; id < NODES; id += 1) pool.push_back(payloadFor(id));

    const auto started = std::chrono::steady_clock::now();
    guard += body(pool);
    const auto finished = std::chrono::steady_clock::now();
    const double ms =
        std::chrono::duration<double, std::milli>(finished - started).count();
    if (ms < bestMs) bestMs = ms;
  }
  // min, not mean: same rule the JS benches here follow — allocation-bound work has a long tail
  // and the floor is the reproducible number.
  std::printf("%-46s %8.3f ms   (guard %lld)\n", label, bestMs, guard);
  return bestMs;
}

}  // namespace

int main(int argc, char **argv) {
  captured = loadPayloads(argc > 1 ? argv[1] : "payloads.json");

  long long capturedKeys = 0;
  for (const auto &entry : captured) capturedKeys += entry.size();
  std::printf(
      "captured payloads: %zu nodes, %lld keys, %.2f per node\n"
      "replayed to %d nodes, best of %d\n\n",
      captured.size(), capturedKeys,
      static_cast<double>(capturedKeys) / static_cast<double>(captured.size()),
      NODES, REPEATS);

  // ARM 1 — the control. The same reads, no copy anywhere. If arm 2 matches it, the copies are
  // free and the header reading that started this is moot. Drained TWICE to match arms 2 and 3,
  // which read both the RawProps copy and the committed one — draining once folds N reads into
  // what then reads as copy cost. The guard values printed beside each arm are what say the three
  // did identical observable work; read them before the timings.
  const double noCopies =
      best("1  no copies (control)", [](std::vector<folly::dynamic> &pool) {
        long long sum = 0;
        for (int id = 0; id < NODES; id += 1) {
          sum += drain(pool[static_cast<size_t>(id)]);
          sum += drain(pool[static_cast<size_t>(id)]);
        }
        return sum;
      });

  // ARM 2 — today: one copy into the RawProps temporary, one into committedProps.
  const double twoCopies =
      best("2  2 copies (today)", [](std::vector<folly::dynamic> &pool) {
        long long sum = 0;
        std::vector<folly::dynamic> committed;
        committed.reserve(NODES);
        for (int id = 0; id < NODES; id += 1) {
          const folly::dynamic &payload = pool[static_cast<size_t>(id)];
          folly::dynamic forRawProps = folly::dynamic(payload);  // removable
          sum += drain(forRawProps);
          committed.push_back(payload);
        }
        for (const auto &entry : committed) sum += drain(entry);
        return sum;
      });

  // ARM 3 — proposed: committedProps takes its copy, then the payload is MOVED into the RawProps
  // sink. Same observable state, one deep copy fewer per node.
  const double oneCopy =
      best("3  1 copy + move (proposed)", [](std::vector<folly::dynamic> &pool) {
        long long sum = 0;
        std::vector<folly::dynamic> committed;
        committed.reserve(NODES);
        for (int id = 0; id < NODES; id += 1) {
          folly::dynamic &payload = pool[static_cast<size_t>(id)];
          committed.push_back(payload);                     // the required copy
          folly::dynamic forRawProps = std::move(payload);  // no copy
          sum += drain(forRawProps);
        }
        for (const auto &entry : committed) sum += drain(entry);
        return sum;
      });

  std::printf("\nthe copy that can be removed: %.3f ms per %d-node create\n",
              twoCopies - oneCopy, NODES);
  std::printf("both copies against the no-copy floor: %.3f ms\n",
              twoCopies - noCopies);
  return 0;
}

// Build (no pod, no simulator, no device — the paths come from an installed example's Pods):
//
//   P=examples/solid/ios/Pods
//   F=$P/ReactNativeDependencies/framework/packages/react-native/ReactNativeDependencies.xcframework/macos-arm64_x86_64
//   clang++ -std=c++20 -O2 -DNDEBUG \
//     -I$P/Headers/Public/ReactNativeDependencies \
//     -F$F -framework ReactNativeDependencies \
//     -o /tmp/dynamic-copy core/engine/bench/dynamic-copy.cpp && /tmp/dynamic-copy
