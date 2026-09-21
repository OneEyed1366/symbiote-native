// Does the targeted replace REMOVE the child clones, or only move them to a later phase?
//
// F-38 measured the targeted `replaceChild` path against a full list hand-over and reported that it
// avoids 999 node clones per list-changing commit. That measurement counted clones at COMMIT time
// only, and this file exists because reading further in Yoga suggests it cannot be the whole story:
//
//   CalculateLayout.cpp:1405   node->cloneChildrenIfNeeded();   // "Ensure that each child has a
//                                                               //  mutable copy"
//   Node.cpp:388               if (child->getOwner() != this) { child = config_->cloneNode(...); }
//
// and RN installs a real clone callback on every node's config
// (`YogaLayoutableShadowNode::initializeYogaConfig` → `yogaNodeCloneCallbackConnector` →
// `cloneChildInPlace`, which is `childNode.clone(...)` plus a `replaceChild` — the same work
// `adoptYogaChild` does at commit).
//
// So the two arms look like they differ in WHEN, not in HOW MUCH:
//
//   hand the list over    every child re-adopted and cloned at COMMIT; owner becomes the new
//                         parent, so layout finds nothing to clone
//   targeted replace      untouched children keep the PREVIOUS revision as their owner, so the
//                         first layout that does work on the parent clones them all
//
// If that is right, F-38's headline is wrong and the change still pays for itself by a smaller
// amount — no vector rebuild, no re-adoption, no per-child `dynamic_pointer_cast`, no per-child
// style comparison — but the clones are not saved. Reading the source is what raised the question;
// only running Yoga can settle it, which is the whole reason a Yoga oracle exists in this tree.
//
//   clang++ -std=c++20 -O2 -DNDEBUG \
//     -I.vendors/react-native/packages/react-native/ReactCommon/yoga \
//     $(find .vendors/react-native/packages/react-native/ReactCommon/yoga/yoga -name '*.cpp') \
//     core/engine/bench/replace-child-layout-clones.cpp -o /tmp/rclc && /tmp/rclc
//
// WHAT IT DOES NOT SETTLE. Yoga, and only Yoga. The clone callback here counts a call and hands back
// a fresh node; RN's connector builds a whole ShadowNode, so a clone is strictly more expensive on
// device than it is here. That makes this a COUNT, never a price — which is the only thing the
// comparison needs, since both arms would pay the same price per clone.

#include <cstdio>
#include <vector>
#include <yoga/Yoga.h>
#include <yoga/node/Node.h>

namespace {

using facebook::yoga::Node;

constexpr size_t kWidth = 1000;
constexpr size_t kReplacedAt = 500;
constexpr float kRootWidth = 320.0f;
constexpr float kRowHeight = 44.0f;

size_t layoutClones = 0;
YGConfigRef sharedConfig = nullptr;

/**
 * Stand-in for `yogaNodeCloneCallbackConnector`.
 *
 * Yoga calls this from `Node::cloneChildrenIfNeeded` for a child whose owner is not the parent
 * about to lay it out. RN answers with `cloneChildInPlace`, i.e. a real ShadowNode clone; here it is
 * a fresh node carrying the same style, because what is being compared is how OFTEN it is called.
 */
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

YGNodeRef makeRow() {
  YGNodeRef row = YGNodeNewWithConfig(sharedConfig);
  YGNodeStyleSetHeight(row, kRowHeight);
  YGNodeStyleSetFlexGrow(row, 0.0f);
  return row;
}

/** A laid-out parent owning `kWidth` rows: the committed revision both arms start from. */
YGNodeRef buildCommitted(std::vector<YGNodeRef> &children) {
  YGNodeRef parent = YGNodeNewWithConfig(sharedConfig);
  YGNodeStyleSetWidth(parent, kRootWidth);
  YGNodeStyleSetFlexDirection(parent, YGFlexDirectionColumn);
  for (size_t at = 0; at < kWidth; at += 1) {
    YGNodeRef row = makeRow();
    YGNodeInsertChild(parent, row, at);
    children.push_back(row);
  }
  // Lay it out once, so the standing tree is CLEAN. A dirty parent would make the next layout pass
  // do work for a reason unrelated to the arm under test.
  YGNodeCalculateLayout(parent, kRootWidth, YGUndefined, YGDirectionLTR);
  return parent;
}

struct IArm {
  size_t commitClones = 0;
  size_t layoutClones = 0;
  size_t childCount = 0;
  float lastRowTop = 0.0f;
};

/**
 * TODAY'S PATH: the whole child list is handed to Fabric.
 *
 * `updateYogaChildren` clears the parent's children and re-adopts every one; `adoptYogaChild` finds
 * each still owned by the previous revision and clones it. Modelled here as the clone plus the
 * insert, counted at commit.
 */
IArm listHandover(const std::vector<YGNodeRef> &committed, YGNodeRef replacement) {
  IArm arm;
  YGNodeRef parent = YGNodeNewWithConfig(sharedConfig);
  YGNodeStyleSetWidth(parent, kRootWidth);
  YGNodeStyleSetFlexDirection(parent, YGFlexDirectionColumn);

  for (size_t at = 0; at < committed.size(); at += 1) {
    YGNodeRef child = replacement;
    if (at != kReplacedAt) {
      arm.commitClones += 1;
      child = YGNodeNewWithConfig(sharedConfig);
      YGNodeCopyStyle(child, committed[at]);
    }
    YGNodeInsertChild(parent, child, at);
  }

  layoutClones = 0;
  YGNodeCalculateLayout(parent, kRootWidth, YGUndefined, YGDirectionLTR);
  arm.layoutClones = layoutClones;
  arm.childCount = YGNodeGetChildCount(parent);
  arm.lastRowTop = YGNodeLayoutGetTop(YGNodeGetChild(parent, kWidth - 1));
  return arm;
}

/**
 * THE SHIPPED PATH: clone the parent keeping its children, then rewrite one slot.
 *
 * `setChildren` is what reproduces the state a `childrenPlaceholder()` clone is in — the same child
 * pointers, and every one of them still owned by the PREVIOUS revision, because `yoga::Node`'s copy
 * constructor is `= default` and re-owns nothing.
 */
IArm targetedReplace(const std::vector<YGNodeRef> &committed, YGNodeRef replacement) {
  IArm arm;
  YGNodeRef parent = YGNodeNewWithConfig(sharedConfig);
  YGNodeStyleSetWidth(parent, kRootWidth);
  YGNodeStyleSetFlexDirection(parent, YGFlexDirectionColumn);

  std::vector<Node *> shared;
  for (YGNodeRef child : committed) shared.push_back(asNode(child));
  asNode(parent)->setChildren(shared);

  asNode(parent)->replaceChild(asNode(replacement), kReplacedAt);
  asNode(replacement)->setOwner(asNode(parent));
  asNode(parent)->setDirty(true);

  layoutClones = 0;
  YGNodeCalculateLayout(parent, kRootWidth, YGUndefined, YGDirectionLTR);
  arm.layoutClones = layoutClones;
  arm.childCount = YGNodeGetChildCount(parent);
  arm.lastRowTop = YGNodeLayoutGetTop(YGNodeGetChild(parent, kWidth - 1));
  return arm;
}

// ── section 2: does the change reach layout at all? ────────────────────────────────────────────
//
// Section 1 forced the parent dirty so the two arms could be compared on clone count. Nothing in
// the real path does that, and reading the two sides says they disagree about who dirties whom:
//
//   hand-over    `updateYogaChildren` ends with `yogaNode_.setDirty(!isClean)`, and `isClean`
//                requires every child to be non-dirty with an unchanged style — so a dirty child
//                dirties its parent, and the flag walks up one level per clone
//   targeted     `yoga::Node::replaceChild` sets no flag, and `completeClone` sets one only for a
//                MeasurableYogaNode — a plain `<View>` list parent is not one
//
// A `<View>` ancestor chain would then stay CLEAN while the replaced row is dirty. That is not a
// slower path, it is a wrong one: the row's new height would never reach the layout.

constexpr float kTallRowHeight = 88.0f;

struct ITree {
  YGNodeRef root = nullptr;
  YGNodeRef list = nullptr;
  std::vector<YGNodeRef> rows;
};

/** Root → list → rows, laid out once, so an ANCESTOR exists whose layout cache can go stale. */
ITree buildTree() {
  ITree tree;
  tree.root = YGNodeNewWithConfig(sharedConfig);
  YGNodeStyleSetWidth(tree.root, kRootWidth);
  YGNodeStyleSetFlexDirection(tree.root, YGFlexDirectionColumn);

  tree.list = YGNodeNewWithConfig(sharedConfig);
  YGNodeStyleSetFlexDirection(tree.list, YGFlexDirectionColumn);
  YGNodeInsertChild(tree.root, tree.list, 0);

  for (size_t at = 0; at < kWidth; at += 1) {
    YGNodeRef row = makeRow();
    YGNodeInsertChild(tree.list, row, at);
    tree.rows.push_back(row);
  }
  YGNodeCalculateLayout(tree.root, kRootWidth, YGUndefined, YGDirectionLTR);
  return tree;
}

/**
 * `yoga::Node`'s copy constructor, which is what a ShadowNode clone does to its yoga node.
 *
 * `Node(const Node&) = default` — the children list, the layout cache and the dirty flag all come
 * across, and no child is re-owned. Inheriting the CACHE is the half that makes staleness possible.
 */
YGNodeRef copyOf(YGNodeRef source) {
  return new Node(*asNode(source));
}

// The two replacements a commit can produce, and BOTH are copies of the standing row rather than
// fresh nodes — a ShadowNode clone copy-constructs its yoga node, so the layout cache, the config
// version and the clean flag all come across. A fresh node carries none of those and makes the
// parent do work for a reason the real path never has.

/**
 * A row that got taller.
 *
 * Written through `setStyle` + `setDirty` rather than `YGNodeStyleSetHeight`, and the difference is
 * the whole question. The public C setter runs `updateStyle`, which ends in `markDirtyAndPropagate`
 * and walks the flag all the way up; `YogaLayoutableShadowNode::updateYogaProps` does neither —
 * `yogaNode_.setStyle(styleResult)` is a plain assignment next to a plain `yogaNode_.setDirty(true)`.
 * Modelling this with the C setter answers a question about Yoga's public API instead of one about
 * Fabric, and it silently turns every arm below green.
 */
YGNodeRef makeTallRow(YGNodeRef standing) {
  YGNodeRef row = copyOf(standing);
  auto style = asNode(row)->style();
  style.setDimension(
      facebook::yoga::Dimension::Height,
      facebook::yoga::StyleSizeLength::points(kTallRowHeight));
  asNode(row)->setStyle(style);
  asNode(row)->setDirty(true);
  return row;
}

float lastRowTop(YGNodeRef root) {
  return YGNodeLayoutGetTop(YGNodeGetChild(YGNodeGetChild(root, 0), kWidth - 1));
}

struct IChainResult {
  float lastRowTop = 0.0f;
  size_t commitClones = 0;
  size_t layoutClones = 0;

  size_t totalClones() const { return commitClones + layoutClones; }
};

/**
 * A row repainted rather than resized — a `select` changing only a background colour.
 *
 * The case the whole targeted path is really for. Nothing Yoga cares about moved, so `updateYoga-
 * Props` leaves the node clean, no ancestor is dirtied, and the layout pass has nothing to do. The
 * hand-over arm cannot reach that state: it clones every child at commit, before anything has had
 * the chance to decide the layout is unchanged.
 */
YGNodeRef makeRepaintedRow(YGNodeRef standing) {
  return copyOf(standing);
}

/** Clone each ancestor keeping its children, and rewrite the one slot that moved. */
IChainResult targetedChain(const ITree &tree) {
  YGNodeRef tallRow = makeTallRow(tree.rows[kReplacedAt]);

  YGNodeRef newList = copyOf(tree.list);
  asNode(newList)->replaceChild(asNode(tallRow), kReplacedAt);
  asNode(tallRow)->setOwner(asNode(newList));

  YGNodeRef newRoot = copyOf(tree.root);
  asNode(newRoot)->replaceChild(asNode(newList), size_t{0});
  asNode(newList)->setOwner(asNode(newRoot));

  layoutClones = 0;
  YGNodeCalculateLayout(newRoot, kRootWidth, YGUndefined, YGDirectionLTR);
  return {.lastRowTop = lastRowTop(newRoot), .layoutClones = layoutClones};
}

/**
 * The targeted path with the missing half put back: a parent whose replaced child is dirty dirties
 * ITSELF, which is the one thing `updateYogaChildren` does that `replaceChild` does not.
 *
 * `LayoutableShadowNode::dirtyLayout()` and `getIsLayoutClean()` are both public, so this is
 * expressible from outside Fabric — the engine walks children before their parent, so setting the
 * flag here is enough to carry it the whole way up.
 */
IChainResult targetedChainDirtied(const ITree &tree, YGNodeRef replacement) {
  YGNodeRef newList = copyOf(tree.list);
  asNode(newList)->replaceChild(asNode(replacement), kReplacedAt);
  asNode(replacement)->setOwner(asNode(newList));
  if (asNode(replacement)->isDirty()) asNode(newList)->setDirty(true);

  YGNodeRef newRoot = copyOf(tree.root);
  asNode(newRoot)->replaceChild(asNode(newList), size_t{0});
  asNode(newList)->setOwner(asNode(newRoot));
  if (asNode(newList)->isDirty()) asNode(newRoot)->setDirty(true);

  layoutClones = 0;
  YGNodeCalculateLayout(newRoot, kRootWidth, YGUndefined, YGDirectionLTR);
  return {.lastRowTop = lastRowTop(newRoot), .layoutClones = layoutClones};
}

// ── section 3: does the child-list snapshot survive the layout pass? ───────────────────────────
//
// `adoptLandedChildren` in `SymbioteTree.cpp` records what Fabric HOLDS at the end of the commit,
// and its own comment names the failure this section measures: "Handing back the orphan makes every
// child differ on the next commit, so both walks — and the differ behind them — descend the entire
// tree for a one-row change."
//
// That snapshot is taken at COMMIT time. `cloneChildrenIfNeeded` runs later, during LAYOUT, and
// replaces children in place. The two paths are not symmetric about it:
//
//   hand-over    `adoptYogaChild` re-owned every child at commit, so layout finds owner == parent
//                and clones nothing — the snapshot still names the tree
//   targeted     nothing was re-owned, so layout clones the standing children and swaps them in —
//                the snapshot names nodes that are no longer there
//
// If that is right, the targeted path buys a cheap commit and charges the NEXT one, which would be
// invisible to every counter in the ledger because `installFabric` has no layout pass at all.

struct IStaleness {
  size_t width = 0;
  /** Positions whose child is no longer the one the commit recorded. */
  size_t mismatches = 0;
  size_t layoutClones = 0;
  /**
   * Whether the NEXT commit could still find a recorded child in order to replace it.
   *
   * `ShadowNode::replaceChild` takes the old child BY REFERENCE and looks it up: it trusts
   * `suggestedIndex` only if `children.at(suggestedIndex).get() == &oldChild`, otherwise scans, and
   * if the scan also misses it hits `react_native_assert(false && "Child to replace was not
   * found.")` — which compiles to NOTHING in a Release build, so the function returns having
   * replaced nothing. Not slower: silently dropped.
   */
  bool staleChildStillFindable = true;
};

/** A row far from the replaced one, so it is one of the standing children a layout pass may clone. */
constexpr size_t kNextCommitTouches = 600;

IStaleness snapshotAfterLayout(const ITree &tree, YGNodeRef replacement) {
  YGNodeRef newList = copyOf(tree.list);
  asNode(newList)->replaceChild(asNode(replacement), kReplacedAt);
  asNode(replacement)->setOwner(asNode(newList));
  if (asNode(replacement)->isDirty()) asNode(newList)->setDirty(true);

  YGNodeRef newRoot = copyOf(tree.root);
  asNode(newRoot)->replaceChild(asNode(newList), size_t{0});
  asNode(newList)->setOwner(asNode(newRoot));
  if (asNode(newList)->isDirty()) asNode(newRoot)->setDirty(true);

  // What `adoptLandedChildren` would store, read at exactly the moment it reads it.
  std::vector<Node *> snapshot;
  for (size_t at = 0; at < YGNodeGetChildCount(newList); at += 1) {
    snapshot.push_back(asNode(YGNodeGetChild(newList, at)));
  }

  layoutClones = 0;
  YGNodeCalculateLayout(newRoot, kRootWidth, YGUndefined, YGDirectionLTR);

  IStaleness out;
  out.width = snapshot.size();
  out.layoutClones = layoutClones;
  for (size_t at = 0; at < snapshot.size(); at += 1) {
    if (asNode(YGNodeGetChild(newList, at)) != snapshot[at]) out.mismatches += 1;
  }

  // `ShadowNode::replaceChild`'s own lookup, run against the tree the next commit would see: the
  // suggested index first, then the linear scan it falls back to.
  const Node *recorded = snapshot[kNextCommitTouches];
  out.staleChildStillFindable =
      asNode(YGNodeGetChild(newList, kNextCommitTouches)) == recorded;
  for (size_t at = 0; at < snapshot.size() && !out.staleChildStillFindable; at += 1) {
    if (asNode(YGNodeGetChild(newList, at)) == recorded) {
      out.staleChildStillFindable = true;
    }
  }
  return out;
}

/**
 * The same question for F-48's append, which cannot avoid it.
 *
 * A targeted replace only dirties the parent when the replacement moved layout, so it has a safe
 * case. An append has none: the child COUNT changed, `updateYogaChildren` would read `isClean` false
 * before looking at any child, and the Yoga `appendChild` override dirties the node itself. Layout
 * therefore always runs on the parent, and the standing children were never re-owned.
 */
IStaleness appendSnapshotAfterLayout(const ITree &tree, const std::vector<YGNodeRef> &tail) {
  YGNodeRef newList = copyOf(tree.list);
  for (YGNodeRef fresh : tail) {
    asNode(newList)->insertChild(asNode(fresh), YGNodeGetChildCount(newList));
    asNode(fresh)->setOwner(asNode(newList));
  }
  asNode(newList)->setDirty(true);

  YGNodeRef newRoot = copyOf(tree.root);
  asNode(newRoot)->replaceChild(asNode(newList), size_t{0});
  asNode(newList)->setOwner(asNode(newRoot));
  asNode(newRoot)->setDirty(true);

  std::vector<Node *> snapshot;
  for (size_t at = 0; at < YGNodeGetChildCount(newList); at += 1) {
    snapshot.push_back(asNode(YGNodeGetChild(newList, at)));
  }

  layoutClones = 0;
  YGNodeCalculateLayout(newRoot, kRootWidth, YGUndefined, YGDirectionLTR);

  IStaleness out;
  out.width = snapshot.size();
  out.layoutClones = layoutClones;
  for (size_t at = 0; at < snapshot.size(); at += 1) {
    if (asNode(YGNodeGetChild(newList, at)) != snapshot[at]) out.mismatches += 1;
  }
  const Node *recorded = snapshot[kNextCommitTouches];
  out.staleChildStillFindable =
      asNode(YGNodeGetChild(newList, kNextCommitTouches)) == recorded;
  for (size_t at = 0; at < snapshot.size() && !out.staleChildStillFindable; at += 1) {
    if (asNode(YGNodeGetChild(newList, at)) == recorded) {
      out.staleChildStillFindable = true;
    }
  }
  return out;
}

/** Hand each ancestor a fresh child list, and apply `updateYogaChildren`'s own dirty rule. */
IChainResult handoverChain(const ITree &tree) {
  YGNodeRef tallRow = makeTallRow(tree.rows[kReplacedAt]);

  YGNodeRef newList = copyOf(tree.list);
  std::vector<Node *> next;
  bool isListClean = !YGNodeIsDirty(newList);
  size_t commitClones = 0;
  for (size_t at = 0; at < tree.rows.size(); at += 1) {
    Node *child = at == kReplacedAt ? asNode(tallRow) : asNode(tree.rows[at]);
    // `adoptYogaChild`: a child still owned by the previous revision is CLONED here and now, which
    // is the eager half the targeted path skips. Counted at commit, so the two phases stay apart.
    if (child->getOwner() != asNode(newList)) {
      commitClones += 1;
      child = asNode(copyOf(child));
    }
    child->setOwner(asNode(newList));
    next.push_back(child);
    isListClean = isListClean && !child->isDirty();
  }
  asNode(newList)->setChildren(next);
  asNode(newList)->setDirty(!isListClean);

  YGNodeRef newRoot = copyOf(tree.root);
  const bool isRootClean = !YGNodeIsDirty(newRoot) && !YGNodeIsDirty(newList);
  asNode(newRoot)->setChildren({asNode(newList)});
  asNode(newList)->setOwner(asNode(newRoot));
  asNode(newRoot)->setDirty(!isRootClean);

  layoutClones = 0;
  YGNodeCalculateLayout(newRoot, kRootWidth, YGUndefined, YGDirectionLTR);
  return {.lastRowTop = lastRowTop(newRoot),
          .commitClones = commitClones,
          .layoutClones = layoutClones};
}

} // namespace

int main() {
  sharedConfig = YGConfigNew();
  YGConfigSetCloneNodeFunc(sharedConfig, countingClone);

  std::vector<YGNodeRef> committedA;
  buildCommitted(committedA);
  YGNodeRef replacementA = makeRow();
  IArm handed = listHandover(committedA, replacementA);

  std::vector<YGNodeRef> committedB;
  buildCommitted(committedB);
  YGNodeRef replacementB = makeRow();
  IArm targeted = targetedReplace(committedB, replacementB);

  std::printf("width %zu, one child replaced at %zu\n\n", kWidth, kReplacedAt);
  std::printf("%20s %8s %8s %8s %10s\n", "arm", "commit", "layout", "total", "children");
  std::printf("%20s %8zu %8zu %8zu %10zu\n", "list hand-over", handed.commitClones,
              handed.layoutClones, handed.commitClones + handed.layoutClones, handed.childCount);
  std::printf("%20s %8zu %8zu %8zu %10zu\n", "targeted replace", targeted.commitClones,
              targeted.layoutClones, targeted.commitClones + targeted.layoutClones,
              targeted.childCount);

  const size_t handedTotal = handed.commitClones + handed.layoutClones;
  const size_t targetedTotal = targeted.commitClones + targeted.layoutClones;
  const bool clonesMoved = targetedTotal >= handedTotal;

  // Both arms must still lay the list out the same way, or nothing above is comparable.
  const bool sameLayout = handed.lastRowTop == targeted.lastRowTop &&
      handed.childCount == targeted.childCount;
  std::printf("\nsame resulting layout: %s (last row top %.1f vs %.1f)\n",
              sameLayout ? "YES" : "NO", handed.lastRowTop, targeted.lastRowTop);
  std::printf("clones only MOVED to layout, not removed: %s\n", clonesMoved ? "YES" : "NO");

  // ── section 2 ─────────────────────────────────────────────────────────────────────────────────
  //
  // One row of a laid-out list doubles in height. The last row has to move down by exactly that
  // difference; a chain that never re-lays out reports the row still standing where it was.
  const ITree treeHandover = buildTree();
  const float beforeTop = lastRowTop(treeHandover.root);
  const IChainResult handoverResized = handoverChain(treeHandover);
  const float handoverTop = handoverResized.lastRowTop;

  const ITree treeTargeted = buildTree();
  const IChainResult targetedRaw = targetedChain(treeTargeted);
  const float targetedTop = targetedRaw.lastRowTop;

  const ITree treeDirtied = buildTree();
  const IChainResult dirtied =
      targetedChainDirtied(treeDirtied, makeTallRow(treeDirtied.rows[kReplacedAt]));

  const ITree treeRepaint = buildTree();
  const IChainResult repainted = targetedChainDirtied(
      treeRepaint, makeRepaintedRow(treeRepaint.rows[kReplacedAt]));

  const float expectedTop = beforeTop + (kTallRowHeight - kRowHeight);
  const bool handoverReaches = handoverTop == expectedTop;
  const bool targetedReaches = targetedTop == expectedTop;
  const bool dirtiedReaches = dirtied.lastRowTop == expectedTop;
  // A repaint must NOT move anything, and must not clone a single child to discover that.
  const bool repaintHeld =
      repainted.lastRowTop == beforeTop && repainted.layoutClones == 0;

  std::printf("\n-- one row grows %.0f -> %.0f, does the list re-lay out --\n", kRowHeight,
              kTallRowHeight);
  std::printf("%26s %12s %12s\n", "arm", "last row top", "correct");
  std::printf("%26s %12.1f %12s\n", "list hand-over", handoverTop,
              handoverReaches ? "YES" : "NO");
  std::printf("%26s %12.1f %12s\n", "targeted, no propagation", targetedTop,
              targetedReaches ? "YES" : "NO");
  std::printf("%26s %12.1f %12s\n", "targeted + propagation", dirtied.lastRowTop,
              dirtiedReaches ? "YES" : "NO");
  std::printf("expected %.1f, was %.1f before the change\n", expectedTop, beforeTop);

  // WHAT THE TARGETED PATH IS ACTUALLY WORTH, now that section 1 has withdrawn the clone claim.
  // A resize pays its clones either way and only moves them; a repaint pays none at all, and the
  // hand-over arm cannot reach that state because it clones before anything can decide.
  // WHAT THE TARGETED PATH IS WORTH once section 1 has withdrawn the blanket clone claim. A resize
  // pays its clones either way and only moves them into the layout pass; a repaint pays none at
  // all, because nothing is ever dirtied and layout has nothing to do. The hand-over arm cannot
  // reach that second row: it clones at commit, before anything can decide the layout held.
  std::printf("\n-- child clones per commit, by what the change touches --\n");
  std::printf("%26s %10s %10s\n", "change", "handover", "targeted");
  std::printf("%26s %10zu %10zu\n", "resize (layout moves)", handoverResized.totalClones(),
              dirtied.totalClones());
  std::printf("%26s %10zu %10zu\n", "repaint (layout holds)", handoverResized.commitClones,
              repainted.totalClones());

  // ── section 3 ─────────────────────────────────────────────────────────────────────────────────
  const ITree treeStaleResize = buildTree();
  const IStaleness staleResize = snapshotAfterLayout(
      treeStaleResize, makeTallRow(treeStaleResize.rows[kReplacedAt]));

  const ITree treeStaleRepaint = buildTree();
  const IStaleness staleRepaint = snapshotAfterLayout(
      treeStaleRepaint, makeRepaintedRow(treeStaleRepaint.rows[kReplacedAt]));

  std::printf("\n-- does the commit's child-list snapshot survive the layout pass --\n");
  std::printf("%26s %8s %12s %8s %14s\n", "change", "width", "stale slots", "clones",
              "next commit");
  std::printf("%26s %8zu %12zu %8zu %14s\n", "resize (layout moves)", staleResize.width,
              staleResize.mismatches, staleResize.layoutClones,
              staleResize.staleChildStillFindable ? "can replace" : "DROPS IT");
  std::printf("%26s %8zu %12zu %8zu %14s\n", "repaint (layout holds)", staleRepaint.width,
              staleRepaint.mismatches, staleRepaint.layoutClones,
              staleRepaint.staleChildStillFindable ? "can replace" : "DROPS IT");

  const ITree treeStaleAppend = buildTree();
  std::vector<YGNodeRef> tail;
  for (size_t at = 0; at < 4; at += 1) tail.push_back(makeRow());
  const IStaleness staleAppend = appendSnapshotAfterLayout(treeStaleAppend, tail);
  std::printf("%26s %8zu %12zu %8zu %14s\n", "append (F-48)", staleAppend.width,
              staleAppend.mismatches, staleAppend.layoutClones,
              staleAppend.staleChildStillFindable ? "can replace" : "DROPS IT");
  std::printf("\"next commit\" replaces row %zu using the child this commit recorded;\n"
              "not finding it means `ShadowNode::replaceChild` returns having done nothing.\n",
              kNextCommitTouches);

  // The repaint must leave the snapshot whole, or the targeted path is self-defeating even on the
  // one change it was built for.
  const bool repaintSnapshotHolds = staleRepaint.mismatches == 0;

  // ── section 4: what a clone actually costs, in bytes ──────────────────────────────────────────
  //
  // Sections 1-3 count clones. A count is a mechanism and not a magnitude, and this investigation's
  // own rule says so — but the yoga half of a clone is a COPY CONSTRUCTOR over a fixed-size struct,
  // so its cost per clone is a compile-time fact rather than a device measurement. That converts
  // "1 000 clones" into bytes without ever starting a simulator.
  //
  // It is the yoga half only. A ShadowNode clone also copies a props shared_ptr, a family refcount
  // and a children vector share, none of which are sized here.
  std::printf("\n-- the yoga half of a clone, in bytes --\n");
  std::printf("%26s %10zu\n", "sizeof(yoga::Style)", sizeof(facebook::yoga::Style));
  std::printf("%26s %10zu\n", "sizeof(yoga::Node)", sizeof(Node));
  std::printf("%26s %10zu\n", "x1000 standing children",
              sizeof(Node) * static_cast<size_t>(kWidth));
  std::printf("a commit that re-adopts a 1 000-child list copies that much yoga, once per commit\n");

  // The middle arm of section 2 is the NEGATIVE CONTROL and is meant to read NO. It is what says
  // the propagation is load-bearing rather than decorative — delete it and nothing can tell the
  // two apart.
  YGConfigFree(sharedConfig);
  return sameLayout && handoverReaches && !targetedReaches && dirtiedReaches &&
          repaintHeld && repaintSnapshotHolds
      ? 0
      : 1;
}
