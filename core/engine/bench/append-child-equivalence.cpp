// Appending to a standing list: `ShadowNode::appendChild` for the tail, against handing the whole
// list over.
//
// The ledger's `append 1000` row re-adopts 2 001 children to add 1 000, because the child set is
// rebuilt wholesale even though the previous list is a strict PREFIX of the next one. `ShadowNode::
// appendChild` is public and virtual, its Yoga override is O(1) per child (`push_back`, one
// `insertChild`, one `adoptYogaChild` on the last index), and — like `replaceChild` — it is NOT on
// the `nativeFabricUIManager` JSI surface, so it is reachable only from our own C++.
//
// F-45 and F-46 are why this file does not stop at counting clones. A targeted path that leaves the
// standing children owned by the previous revision does not REMOVE their clones, it defers them
// into the layout pass; and a targeted path that forgets to dirty is not slower but wrong. So both
// arms here are read on three axes: work at commit, clones in each phase, and whether the resulting
// layout is the same one.
//
//   clang++ -std=c++20 -O2 -DNDEBUG \
//     -I.vendors/react-native/packages/react-native/ReactCommon/yoga \
//     $(find .vendors/react-native/packages/react-native/ReactCommon/yoga/yoga -name '*.cpp') \
//     core/engine/bench/append-child-equivalence.cpp -o /tmp/ace && /tmp/ace
//
// Yoga and only Yoga, same caveat as its two siblings: a clone here is a counted call, not a
// ShadowNode. That makes every number below a COUNT, which is all the comparison needs.

#include <cstdio>
#include <vector>
#include <yoga/Yoga.h>
#include <yoga/node/Node.h>

namespace {

using facebook::yoga::Node;

constexpr size_t kStanding = 1000;
constexpr size_t kAppended = 1000;
constexpr float kRootWidth = 320.0f;
constexpr float kRowHeight = 44.0f;

size_t layoutClones = 0;
YGConfigRef sharedConfig = nullptr;

YGNodeRef countingClone(
    YGNodeConstRef oldNode,
    YGNodeConstRef /*owner*/,
    size_t /*childIndex*/) {
  layoutClones += 1;
  YGNodeRef fresh = YGNodeNewWithConfig(sharedConfig);
  YGNodeCopyStyle(fresh, oldNode);
  return fresh;
}

Node *asNode(YGNodeRef node) { return static_cast<Node *>(node); }

/** `yoga::Node(const Node&) = default` — children, layout cache and dirty flag all come across. */
YGNodeRef copyOf(YGNodeRef source) { return new Node(*asNode(source)); }

YGNodeRef makeRow() {
  YGNodeRef row = YGNodeNewWithConfig(sharedConfig);
  YGNodeStyleSetHeight(row, kRowHeight);
  return row;
}

struct ITree {
  YGNodeRef root = nullptr;
  YGNodeRef list = nullptr;
  std::vector<YGNodeRef> rows;
};

ITree buildCommitted() {
  ITree tree;
  tree.root = YGNodeNewWithConfig(sharedConfig);
  YGNodeStyleSetWidth(tree.root, kRootWidth);
  YGNodeStyleSetFlexDirection(tree.root, YGFlexDirectionColumn);

  tree.list = YGNodeNewWithConfig(sharedConfig);
  YGNodeStyleSetFlexDirection(tree.list, YGFlexDirectionColumn);
  YGNodeInsertChild(tree.root, tree.list, 0);

  for (size_t at = 0; at < kStanding; at += 1) {
    YGNodeRef row = makeRow();
    YGNodeInsertChild(tree.list, row, at);
    tree.rows.push_back(row);
  }
  YGNodeCalculateLayout(tree.root, kRootWidth, YGUndefined, YGDirectionLTR);
  return tree;
}

std::vector<YGNodeRef> makeTail() {
  std::vector<YGNodeRef> tail;
  for (size_t at = 0; at < kAppended; at += 1) tail.push_back(makeRow());
  return tail;
}

struct IArm {
  /** Children the commit walks: a cast, an insert and a style comparison each. */
  size_t childrenTouched = 0;
  size_t commitClones = 0;
  size_t layoutClones = 0;
  size_t childCount = 0;
  float lastRowTop = 0.0f;
  float listHeight = 0.0f;

  size_t totalClones() const { return commitClones + layoutClones; }
};

void readBack(IArm &arm, YGNodeRef root) {
  YGNodeRef list = YGNodeGetChild(root, 0);
  arm.childCount = YGNodeGetChildCount(list);
  arm.listHeight = YGNodeLayoutGetHeight(list);
  arm.lastRowTop = YGNodeLayoutGetTop(YGNodeGetChild(list, arm.childCount - 1));
}

/**
 * TODAY: the whole 2 000-child list is handed over.
 *
 * `updateYogaChildren` clears the parent, then per child does a `dynamic_pointer_cast`, an
 * `appendYogaChild`, an `adoptYogaChild` — which clones anything owned by a previous revision — and
 * a full `yoga::Style` equality comparison for the `isClean` verdict. Every one of those is paid for
 * the 1 000 children that did not move.
 */
IArm listHandover(const ITree &tree, const std::vector<YGNodeRef> &tail) {
  IArm arm;
  YGNodeRef newList = copyOf(tree.list);

  std::vector<Node *> next;
  bool isClean = !YGNodeIsDirty(newList);
  for (YGNodeRef standing : tree.rows) {
    Node *child = asNode(standing);
    if (child->getOwner() != asNode(newList)) {
      arm.commitClones += 1;
      child = asNode(copyOf(child));
    }
    child->setOwner(asNode(newList));
    next.push_back(child);
    isClean = isClean && !child->isDirty();
    arm.childrenTouched += 1;
  }
  for (YGNodeRef fresh : tail) {
    asNode(fresh)->setOwner(asNode(newList));
    next.push_back(asNode(fresh));
    isClean = isClean && !asNode(fresh)->isDirty();
    arm.childrenTouched += 1;
  }
  asNode(newList)->setChildren(next);
  // The child COUNT changed, so the list cannot be clean whatever the per-child verdict said.
  asNode(newList)->setDirty(true);
  (void)isClean;

  YGNodeRef newRoot = copyOf(tree.root);
  asNode(newRoot)->setChildren({asNode(newList)});
  asNode(newList)->setOwner(asNode(newRoot));
  asNode(newRoot)->setDirty(true);

  layoutClones = 0;
  YGNodeCalculateLayout(newRoot, kRootWidth, YGUndefined, YGDirectionLTR);
  arm.layoutClones = layoutClones;
  readBack(arm, newRoot);
  return arm;
}

/**
 * TARGETED: keep the standing children and append only the tail.
 *
 * `YogaLayoutableShadowNode::appendChild` dirties the parent itself — its own comment says it has no
 * previous structure to compare against — so the flag that F-46 had to add for `replaceChild` comes
 * for free here. Carrying it further UP is still ours: the ancestor chain takes the targeted replace
 * path and `replacedChangedChildren` propagates from the dirty list node.
 */
IArm targetedAppend(const ITree &tree, const std::vector<YGNodeRef> &tail) {
  IArm arm;
  YGNodeRef newList = copyOf(tree.list);

  for (YGNodeRef fresh : tail) {
    // `ShadowNode::appendChild` → `cloneChildrenIfShared` once, then push_back; the Yoga override
    // adds one `insertChild` and one `adoptYogaChild` at the last index.
    asNode(newList)->insertChild(asNode(fresh), YGNodeGetChildCount(newList));
    asNode(fresh)->setOwner(asNode(newList));
    arm.childrenTouched += 1;
  }
  asNode(newList)->setDirty(true);

  YGNodeRef newRoot = copyOf(tree.root);
  asNode(newRoot)->replaceChild(asNode(newList), size_t{0});
  asNode(newList)->setOwner(asNode(newRoot));
  // F-46's propagation, which the ancestor chain does for us once the list node is dirty.
  asNode(newRoot)->setDirty(true);

  layoutClones = 0;
  YGNodeCalculateLayout(newRoot, kRootWidth, YGUndefined, YGDirectionLTR);
  arm.layoutClones = layoutClones;
  readBack(arm, newRoot);
  return arm;
}

} // namespace

int main() {
  sharedConfig = YGConfigNew();
  YGConfigSetCloneNodeFunc(sharedConfig, countingClone);

  const ITree treeA = buildCommitted();
  const IArm handed = listHandover(treeA, makeTail());

  const ITree treeB = buildCommitted();
  const IArm appended = targetedAppend(treeB, makeTail());

  const size_t total = kStanding + kAppended;
  const float expectedTop = static_cast<float>(total - 1) * kRowHeight;
  const float expectedHeight = static_cast<float>(total) * kRowHeight;

  std::printf("%zu standing rows, %zu appended\n\n", kStanding, kAppended);
  std::printf("%20s %10s %8s %8s %8s\n", "arm", "touched", "commit", "layout", "clones");
  std::printf("%20s %10zu %8zu %8zu %8zu\n", "list hand-over", handed.childrenTouched,
              handed.commitClones, handed.layoutClones, handed.totalClones());
  std::printf("%20s %10zu %8zu %8zu %8zu\n", "targeted append", appended.childrenTouched,
              appended.commitClones, appended.layoutClones, appended.totalClones());

  const bool sameTree = handed.childCount == appended.childCount &&
      handed.childCount == total;
  const bool sameLayout = handed.lastRowTop == appended.lastRowTop &&
      handed.listHeight == appended.listHeight;
  const bool layoutCorrect = appended.lastRowTop == expectedTop &&
      appended.listHeight == expectedHeight;

  std::printf("\nsame child count (%zu): %s\n", appended.childCount, sameTree ? "YES" : "NO");
  std::printf("same layout: %s (last row top %.1f vs %.1f, list height %.1f vs %.1f)\n",
              sameLayout ? "YES" : "NO", handed.lastRowTop, appended.lastRowTop,
              handed.listHeight, appended.listHeight);
  std::printf("layout is the CORRECT one (%.1f / %.1f): %s\n", expectedTop, expectedHeight,
              layoutCorrect ? "YES" : "NO");
  std::printf("children touched at commit: %.1fx fewer\n",
              static_cast<double>(handed.childrenTouched) /
                  static_cast<double>(appended.childrenTouched));

  YGConfigFree(sharedConfig);
  return sameTree && sameLayout && layoutCorrect ? 0 : 1;
}
