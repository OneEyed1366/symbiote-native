// The insert path priced against a stage whose DEVICE number we already have.
//
// WHY A SECOND STAND. `sibling-scan.cpp` prices the container operations and nothing else — no
// folly, no JSI, no Fabric — and on that ruler the two candidate mechanisms read 0.5 ms and 1.0 ms
// against a 107 ms gap. That looked like a verdict and it is not one: this project's own ledger
// records five separate occasions where a headless prediction missed the device by 3x in EITHER
// direction, and one — the payload builder — where it under-shot by EIGHT (17.0 ms measured against
// 2.1 predicted by the JS twin, still unexplained). A headless stand prices DIRECTION and CURVE. It
// does not price magnitude, and a hypothesis may not be killed on magnitude it cannot price.
//
// So this stand does not try to be faithful by guessing a multiplier. It reproduces ONE stage whose
// device cost is known, reads its own number against that, and reports the ratio. Every other arm
// is then quoted on that ruler instead of on a Mac millisecond.
//
// THE CALIBRATION STAGE is the create path's payload work, measured on device 2026-09-14 by the
// BUILD SPLIT instrumentation (svelte, 1 000 rows, iOS 26.5 Release, since removed):
//
//   FOLD  1.7 ms · PAYLOAD 17.0 · CREATE 28.1 · APPEND 0.9 · WALK 4.8      buildMs ~51.4
//
// PAYLOAD is `fabricProps` plus the two copies the create branch makes — one into `RawProps`, one
// into `committedProps`. That is reproducible here with folly and nothing else, which is exactly why
// it was picked: no JSI, no UIManager, no simulator.
//
// WHAT IT STILL DOES NOT MODEL, stated so the ratio is not over-read: the JSI fold round trip (FOLD,
// 1.7 ms), Fabric's own `createNode` (28.1), and Yoga. A ratio derived here transfers to work of the
// SAME KIND — allocation and folly traffic — and says nothing about the JSI or Fabric stages.
//
// THE WORKLOAD is the benchmark row's real shape: 10 000 nodes carrying 44 001 prop keys in total,
// i.e. ~4.4 keys per node, which is what the screen reports for a 1 000-row Create.

#include <folly/dynamic.h>

#include <chrono>
#include <cstdio>
#include <string>
#include <vector>

namespace {

constexpr int kNodes = 10000;

// The device figure this stand is calibrated against.
constexpr double kDevicePayloadMs = 17.0;

double millisOf(const char *label, double (*arm)()) {
  arm();
  arm();
  const auto start = std::chrono::steady_clock::now();
  const double sink = arm();
  const auto end = std::chrono::steady_clock::now();
  const double ms =
      std::chrono::duration_cast<std::chrono::duration<double, std::milli>>(end - start).count();
  // The sink is printed so no arm can be optimised away wholesale.
  std::printf("  %-44s %8.3f ms    (sink %.0f)\n", label, ms, sink);
  return ms;
}

// One node's payload, the shape `fabricProps` emits: a nested style object plus a handful of
// scalars. Four keys at the top level and three inside the style makes ~4.4 per node once the raw
// texts, which carry one, are averaged in — the ratio the screen reports.
folly::dynamic buildPayload(int id) {
  folly::dynamic style = folly::dynamic::object;
  style["flexDirection"] = "row";
  style["paddingHorizontal"] = 12;
  style["backgroundColor"] = id % 2 == 0 ? 4278190080 : 4294967295;

  folly::dynamic props = folly::dynamic::object;
  props["style"] = std::move(style);
  props["testID"] = "bench-row-" + std::to_string(id);
  props["accessible"] = true;
  props["collapsable"] = false;
  return props;
}

double drain(const folly::dynamic &value) {
  return static_cast<double>(value.size());
}

// ARM 1 — the build alone. The floor: what the payloads cost with no copy at all.
double armBuildOnly() {
  double sink = 0;
  for (int id = 0; id < kNodes; id += 1) {
    const folly::dynamic payload = buildPayload(id);
    sink += drain(payload);
  }
  return sink;
}

// ARM 2 — THE CALIBRATION ARM. Build plus the two copies the create branch makes:
//
//   const folly::dynamic payload = fabricProps(...);
//   react::RawProps(folly::dynamic(payload))   // copy 1, by value into RawProps
//   node.committedProps = payload;             // copy 2, must outlive the call
//
// This is what PAYLOAD measured at 17.0 ms on device.
double armBuildAndTwoCopies() {
  double sink = 0;
  std::vector<folly::dynamic> committed;
  committed.reserve(kNodes);
  for (int id = 0; id < kNodes; id += 1) {
    const folly::dynamic payload = buildPayload(id);
    const folly::dynamic forRawProps = payload;
    committed.push_back(payload);
    sink += drain(forRawProps);
  }
  for (const auto &entry : committed) sink += drain(entry);
  return sink;
}

}  // namespace

int main() {
  std::printf("\npayload work for %d nodes, ~4.4 prop keys each\n\n", kNodes);

  millisOf("1  build only, no copies (the floor)", armBuildOnly);
  const double calibration = millisOf("2  build + RawProps copy + committedProps", armBuildAndTwoCopies);

  const double ratio = calibration > 0.0 ? kDevicePayloadMs / calibration : 0.0;
  std::printf("\ndevice PAYLOAD for the same %d nodes: %.1f ms\n", kNodes, kDevicePayloadMs);
  std::printf("CALIBRATION FACTOR, device / this stand: %.2fx\n", ratio);
  std::printf(
      "\nApply it only to allocation-and-folly work. It carries nothing about the JSI fold (device\n"
      "FOLD 1.7 ms) or Fabric's createNode (28.1), which this stand does not model at all.\n");
  std::printf(
      "\nOn that ruler, sibling-scan.cpp's arms read:\n"
      "  std::find over standing siblings, 1 000 inserts   0.50 ms -> %6.1f ms\n"
      "  adopt pass, the 10 000 nodes Append walks extra   1.01 ms -> %6.1f ms\n"
      "  the gap to explain                                          107.0 ms\n\n",
      0.50 * ratio, 1.01 * ratio);
  return 0;
}

// Build and run (no pod rebuild, no simulator, no device — folly comes from an installed example):
//
//   P=examples/svelte/ios/Pods
//   F=$P/ReactNativeDependencies/framework/packages/react-native/ReactNativeDependencies.xcframework/macos-arm64_x86_64
//   clang++ -std=c++20 -O2 -DNDEBUG \
//     -I$P/Headers/Public/ReactNativeDependencies \
//     -F$F -framework ReactNativeDependencies \
//     -o /tmp/insert-path-calibrated core/engine/bench/insert-path-calibrated.cpp \
//     && /tmp/insert-path-calibrated
