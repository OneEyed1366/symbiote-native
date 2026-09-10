// What a DIRTY ANCESTOR costs, priced against Yoga alone.
//
// WHY THIS EXISTS. On a 10 001-node tree a one-row change was measured costing ~105 ms inside
// Fabric's commit, of which RN's own telemetry attributes ~85 ms to 2869 text measurements and
// reports 8477 layoutable nodes recomputed. Our tree walk is ~1 ms, so the cost is entirely in what
// the commit ASKS FOR. The open question that no device run can answer cheaply is whether a dirty
// ancestor NECESSARILY drags every descendant through layout — because if Yoga short-circuits a
// clean subtree under a dirty parent, then something we do is defeating that short circuit, and
// that is a bug with a fix. If it does not short-circuit, then the whole cost is downstream of "the
// tree got dirtied at all" and the fix is upstream, in what our commit dirties.
//
// Yoga is the right place to ask: it has ZERO external includes (no folly, no JSI, no glog), so this
// builds with one clang++ invocation and needs no pod, no simulator and no device.
//
//   clang++ -std=c++20 -O2 -DNDEBUG \
//     -I.vendors/react-native/packages/react-native/ReactCommon/yoga \
//     $(find .vendors/react-native/packages/react-native/ReactCommon/yoga/yoga -name '*.cpp') \
//     core/engine/bench/yoga-relayout.cpp -o <scratchpad>/yoga-relayout && <scratchpad>/yoga-relayout
//
// WHAT IT DOES NOT MEASURE, stated so nobody reads more into a number than it carries: this is Yoga
// and only Yoga. It does not run `ShadowTree::commit`, `progressState`, `updateMountedFlag` or the
// differ, it does not clone ShadowNodes, and its "text measurement" is a counter plus an optional
// busy-wait — real CoreText was measured at ~30 us per call and that is the constant used here.
// It answers one question: given this tree shape, how far does a dirty node propagate work.

#include <yoga/Yoga.h>

#include <chrono>
#include <cstdio>
#include <vector>

namespace {

// The benchmark row as it exists in `examples/*/screens/BenchmarkScreen.tsx`, counted in LAYOUTABLE
// nodes — a RawText carries no Yoga node, so it is absent here on purpose. Six measurable leaves per
// row is what makes the text total land near the 2869 the device reported.
constexpr int kRows = 1000;
constexpr int kMeasurablesPerRow = 6;

// Measured on device: 84.8 ms across 2869 measurements. Used only by the `--costly` arm; the default
// arm keeps the measure function free so Yoga's own work is not buried under a simulated constant.
constexpr double kRealTextMeasureUs = 29.6;

int measureCalls = 0;
bool isMeasureCostly = false;

YGSize measureText(
    YGNodeConstRef /*node*/,
    float width,
    YGMeasureMode /*widthMode*/,
    float /*height*/,
    YGMeasureMode /*heightMode*/) {
  measureCalls += 1;
  if (isMeasureCostly) {
    const auto until = std::chrono::steady_clock::now() +
        std::chrono::nanoseconds(static_cast<long long>(kRealTextMeasureUs * 1000));
    while (std::chrono::steady_clock::now() < until) {
    }
  }
  return YGSize{width > 0 ? width : 100.0f, 18.0f};
}

YGNodeRef makeLeaf() {
  const YGNodeRef leaf = YGNodeNew();
  YGNodeSetMeasureFunc(leaf, measureText);
  return leaf;
}

YGNodeRef makeBox(YGFlexDirection direction) {
  const YGNodeRef box = YGNodeNew();
  YGNodeStyleSetFlexDirection(box, direction);
  return box;
}

// One row: a column holding three texts, two pressables each wrapping a text, and an input.
YGNodeRef makeRow(std::vector<YGNodeRef> &leaves) {
  const YGNodeRef row = makeBox(YGFlexDirectionColumn);
  size_t at = 0;
  for (int i = 0; i < 3; i++) {
    const YGNodeRef text = makeLeaf();
    leaves.push_back(text);
    YGNodeInsertChild(row, text, at++);
  }
  for (int i = 0; i < 2; i++) {
    const YGNodeRef pressable = makeBox(YGFlexDirectionRow);
    const YGNodeRef label = makeLeaf();
    leaves.push_back(label);
    YGNodeInsertChild(pressable, label, 0);
    YGNodeInsertChild(row, pressable, at++);
  }
  const YGNodeRef input = makeLeaf();
  leaves.push_back(input);
  YGNodeInsertChild(row, input, at++);
  return row;
}

int countNodes(YGNodeConstRef node) {
  int total = 1;
  for (size_t i = 0; i < YGNodeGetChildCount(node); i++) {
    total += countNodes(YGNodeGetChild(const_cast<YGNodeRef>(node), i));
  }
  return total;
}

// RN clears this flag as it walks the tree copying layout metrics out
// (`YogaLayoutableShadowNode::layout`), so a bench that never clears it would report every node as
// freshly laid out forever. Clearing before each arm is what makes the count mean "this pass".
void clearNewLayout(YGNodeRef node) {
  YGNodeSetHasNewLayout(node, false);
  for (size_t i = 0; i < YGNodeGetChildCount(node); i++) {
    clearNewLayout(YGNodeGetChild(node, i));
  }
}

int countNewLayout(YGNodeConstRef node) {
  int total = YGNodeGetHasNewLayout(node) ? 1 : 0;
  for (size_t i = 0; i < YGNodeGetChildCount(node); i++) {
    total += countNewLayout(YGNodeGetChild(const_cast<YGNodeRef>(node), i));
  }
  return total;
}

struct IArm {
  double ms;
  int measures;
  int recomputed;
};

YGNodeRef buildTree(std::vector<YGNodeRef> &leaves) {
  const YGNodeRef root = makeBox(YGFlexDirectionColumn);
  leaves.reserve(static_cast<size_t>(kRows) * kMeasurablesPerRow);
  for (int i = 0; i < kRows; i++) {
    YGNodeInsertChild(root, makeRow(leaves), static_cast<size_t>(i));
  }
  return root;
}

YGNodeRef buildTree(std::vector<YGNodeRef> &leaves);

// EVERY ARM GETS A FRESH TREE, and that is not tidiness — the first version shared one tree and the
// arms silently corrupted each other. Cloning a row leaves the original's children owned by a node
// that is no longer in the tree, so the arm AFTER a clone arm laid out a broken tree and reported
// "0 measures, 1 recomputed", which reads exactly like a finding and is an artifact.
IArm run(void (*perturb)(YGNodeRef, const std::vector<YGNodeRef> &)) {
  std::vector<YGNodeRef> leaves;
  const YGNodeRef root = buildTree(leaves);
  YGNodeCalculateLayout(root, 390.0f, YGUndefined, YGDirectionLTR);

  clearNewLayout(root);
  measureCalls = 0;
  perturb(root, leaves);
  const auto startedAt = std::chrono::steady_clock::now();
  YGNodeCalculateLayout(root, 390.0f, YGUndefined, YGDirectionLTR);
  const double ms =
      std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - startedAt)
          .count();
  return IArm{ms, measureCalls, countNewLayout(root)};
}

void dirtyNothing(YGNodeRef, const std::vector<YGNodeRef> &) {}

void dirtyOneLeaf(YGNodeRef, const std::vector<YGNodeRef> &leaves) {
  YGNodeMarkDirty(leaves.front());
}

// The closest analogue of what our commit does to the root: `updateYogaChildren` clears the child
// list and re-inserts it. Yoga's `setChildren` dirties the node whenever the list is not identical,
// and re-inserting the SAME nodes is the case that decides whether an unchanged list is free.
void dirtyRootByResettingChildren(YGNodeRef root, const std::vector<YGNodeRef> &) {
  std::vector<YGNodeRef> children;
  for (size_t i = 0; i < YGNodeGetChildCount(root); i++) {
    children.push_back(YGNodeGetChild(root, i));
  }
  YGNodeSetChildren(root, children.data(), children.size());
}

void dirtyRootByStyle(YGNodeRef root, const std::vector<YGNodeRef> &) {
  static float padding = 0;
  padding += 1;
  YGNodeStyleSetPadding(root, YGEdgeTop, padding);
}

// THE ARM THE DEVICE NUMBERS ASKED FOR, and the gap the first version of this bench left: between
// "the root is dirty" and "every leaf is dirty" sits "every ROW is dirty", and only that one can
// explain what was measured.
//
// Device, on this shape: a full CREATE costs 1890 text measurements — that is what measuring every
// leaf exactly once costs, duplicate strings absorbed by the 1024-entry LRU. A Select on the same
// mounted tree costs 2869, i.e. 52% MORE than building it from nothing. A leaf cannot be measured
// more than once per commit unless its PARENT runs the flex algorithm more than once over it, at
// different constraints — which is what a dirty flex container does and a clean one does not.
//
// So this arm dirties the containers and leaves every leaf alone. If measures come out well above
// the leaf count, the multi-pass reading is right and the fix belongs wherever the rows are dirtied.
// If they come out at or below it, the reading is wrong and the extra measurements are eviction.
void dirtyEveryRowByStyle(YGNodeRef root, const std::vector<YGNodeRef> &) {
  static float padding = 0;
  padding += 1;
  for (size_t i = 0; i < YGNodeGetChildCount(root); i++) {
    YGNodeStyleSetPadding(YGNodeGetChild(root, i), YGEdgeTop, padding);
  }
}

// The model check: if every measurable leaf is individually dirty, does the arithmetic land on what
// the device reported? It has to, or the model is wrong and nothing downstream of it means anything.
void dirtyEveryLeaf(YGNodeRef, const std::vector<YGNodeRef> &leaves) {
  for (const YGNodeRef leaf : leaves) YGNodeMarkDirty(leaf);
}

// What `YogaLayoutableShadowNode::adoptYogaChild` does to a child whose yoga owner is still the
// PREVIOUS parent: it clones the child and swaps the clone into the list. Our commit was measured
// doing this ~1030 times per commit (the SWAPS counter on the benchmark screen), so the question
// this arm settles is whether a swapped-in clone costs its whole subtree a re-measure.
//
// `YGNodeClone` keeps the same child POINTERS, exactly as a shallow ShadowNode clone shares its
// children — so the leaves underneath are the SAME objects with their caches intact. If they
// re-measure anyway, the clone is the culprit; if they do not, it is not.
void replaceRowsWithClones(YGNodeRef root, const std::vector<YGNodeRef> &, size_t howMany) {
  std::vector<YGNodeRef> children;
  const size_t count = YGNodeGetChildCount(root);
  for (size_t i = 0; i < count; i++) {
    const YGNodeRef row = YGNodeGetChild(root, i);
    children.push_back(i < howMany ? YGNodeClone(row) : row);
  }
  YGNodeSetChildren(root, children.data(), children.size());
}

void replaceOneRowWithClone(YGNodeRef root, const std::vector<YGNodeRef> &leaves) {
  replaceRowsWithClones(root, leaves, 1);
}

void replaceEveryRowWithClone(YGNodeRef root, const std::vector<YGNodeRef> &leaves) {
  replaceRowsWithClones(root, leaves, static_cast<size_t>(kRows));
}

void report(const char *name, const IArm &arm) {
  std::printf("%-28s %8.2f ms  %7d measures  %7d recomputed\n", name, arm.ms, arm.measures,
              arm.recomputed);
}

} // namespace

int main(int argc, char **argv) {
  isMeasureCostly = argc > 1 && std::string_view(argv[1]) == "--costly";

  std::vector<YGNodeRef> shape;
  const YGNodeRef sample = buildTree(shape);
  std::printf("tree: %d nodes, %zu measurable leaves, measure func %s\n", countNodes(sample),
              shape.size(), isMeasureCostly ? "COSTLY (29.6us)" : "free");
  std::printf("device, same shape: CREATE 1890 measures — every leaf once, duplicates absorbed\n");
  std::printf("                   SELECT 2869 measures, 8477 recomputed, 117 ms layout, 2 clones\n\n");

  report("nothing dirty", run(dirtyNothing));
  report("ONE leaf dirty", run(dirtyOneLeaf));
  report("root children re-set", run(dirtyRootByResettingChildren));
  report("root style changed", run(dirtyRootByStyle));
  report("EVERY row style changed", run(dirtyEveryRowByStyle));
  report("ONE row cloned+swapped", run(replaceOneRowWithClone));
  report("EVERY row cloned+swapped", run(replaceEveryRowWithClone));
  report("every leaf dirty", run(dirtyEveryLeaf));

  return 0;
}
