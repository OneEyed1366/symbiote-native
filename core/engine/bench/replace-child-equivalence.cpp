// The headless oracle F-37 said did not exist.
//
// F-36 found that `YogaLayoutableShadowNode::replaceChild` replaces ONE child in place where handing
// Fabric a child list re-adopts all of them, and measured the prize at 500x on a select. F-37 then
// established that `replaceChild` is not on the JSI surface at all — `UIManagerBinding.cpp` exposes
// only the three clone forms — so the TS applier, which is the spec every other change in this
// investigation was checked against, cannot be written to take the targeted path. It concluded there
// was NO headless oracle.
//
// That conclusion was too quick, and this file is the correction. The risky half of the change is
// not the ShadowNode vector write — that is `children[index] = newChild` on both paths — it is
// whether a targeted yoga replace leaves the parent in the same state as a full re-adopt. Yoga has
// zero external includes and builds with one clang++ invocation, so that half CAN be settled here.
//
//   clang++ -std=c++20 -O2 -DNDEBUG \
//     -I.vendors/react-native/packages/react-native/ReactCommon/yoga \
//     $(find .vendors/react-native/packages/react-native/ReactCommon/yoga/yoga -name '*.cpp') \
//     core/engine/bench/replace-child-equivalence.cpp -o /tmp/rce && /tmp/rce
//
// WHAT IT DOES NOT SETTLE, said plainly so the next reader does not over-claim it: this is Yoga and
// only Yoga. It does not build ShadowNodes, does not run `ShadowTree::commit`, and does not prove
// that Fabric's mount pass sees the same thing. It settles the yoga half, which is the half that
// re-adopts, clones and dirties — and it leaves the ShadowNode half resting on a one-line read.

#include <cstdio>
#include <string>
#include <vector>
#include <yoga/Yoga.h>
#include <yoga/node/Node.h>

namespace {

using facebook::yoga::Node;

constexpr size_t kWidth = 1000;
constexpr size_t kReplacedAt = 500;

// A node's logical identity, so two arms that legitimately hold DIFFERENT pointers can still be
// compared. Arm A clones every standing child by design; comparing pointers would report a
// difference that is the mechanism rather than a defect.
int tagOf(const Node *node) {
  return static_cast<int>(reinterpret_cast<intptr_t>(node->getContext()));
}

Node *makeNode(std::vector<Node *> &owned, int tag, float flexGrow) {
  auto *node = new Node();
  node->setContext(reinterpret_cast<void *>(static_cast<intptr_t>(tag)));
  YGNodeStyleSetFlexGrow(node, flexGrow);
  owned.push_back(node);
  return node;
}

/** `adoptYogaChild`'s rule: a child still owned by a previous revision is CLONED and swapped in. */
Node *adopt(std::vector<Node *> &owned, Node *child, Node *parent, size_t &clones) {
  if (child->getOwner() == parent || child->getOwner() == nullptr) return child;
  clones += 1;
  auto *clone = makeNode(owned, tagOf(child), YGNodeStyleGetFlexGrow(child));
  return clone;
}

struct IArm {
  std::vector<int> tags;
  std::vector<bool> ownedByParent;
  size_t childrenTouched = 0;
  size_t clones = 0;
};

IArm readBack(const Node *parent) {
  IArm state;
  for (size_t at = 0; at < parent->getChildCount(); at += 1) {
    const Node *child = parent->getChild(at);
    state.tags.push_back(tagOf(child));
    state.ownedByParent.push_back(child->getOwner() == parent);
  }
  return state;
}

/** Build a parent owning `kWidth` children, the standing tree both arms start from. */
Node *buildStanding(std::vector<Node *> &owned, std::vector<Node *> &children) {
  auto *parent = makeNode(owned, -1, 0.0f);
  for (size_t at = 0; at < kWidth; at += 1) {
    auto *child = makeNode(owned, static_cast<int>(at), 1.0f);
    children.push_back(child);
  }
  parent->setChildren(children);
  for (auto *child : children) child->setOwner(parent);
  return parent;
}

// TODAY: the whole list is handed over, so every child is re-adopted and any child still owned by a
// previous revision is cloned. This is `updateYogaChildren` reduced to what it does to the children.
IArm listHandover(std::vector<Node *> &owned, Node *previousOwner, Node *replacement) {
  std::vector<Node *> children;
  auto *parent = makeNode(owned, -1, 0.0f);

  IArm work;
  std::vector<Node *> next;
  for (size_t at = 0; at < previousOwner->getChildCount(); at += 1) {
    Node *child = at == kReplacedAt
        ? replacement
        : adopt(owned, previousOwner->getChild(at), parent, work.clones);
    work.childrenTouched += 1;
    next.push_back(child);
  }
  parent->setChildren(next);
  for (auto *child : next) child->setOwner(parent);

  IArm state = readBack(parent);
  state.childrenTouched = work.childrenTouched;
  state.clones = work.clones;
  return state;
}

// TARGETED: the parent keeps its children and one slot is rewritten.
IArm targetedReplace(Node *parent, Node *replacement) {
  replacement->setOwner(parent);
  parent->replaceChild(replacement, kReplacedAt);

  IArm state = readBack(parent);
  state.childrenTouched = 1;
  state.clones = 0;
  return state;
}

bool sameTree(const IArm &left, const IArm &right) {
  if (left.tags != right.tags) return false;
  return left.ownedByParent == right.ownedByParent;
}

/**
 * MANY slots rewritten in one commit, which is what `replacedChangedChildren` actually does.
 *
 * The single-replacement arm above proves equivalence for one slot and says nothing about a loop.
 * Two things could go wrong across iterations and neither is obvious from the source: a replacement
 * could invalidate the indices of the ones after it, and `suggestedIndex` could stop being accurate
 * — the Yoga override VALIDATES it and silently falls back to a `find_if`, so k replacements over a
 * width-N parent would degrade to O(N·k) rather than fail. Slow is the failure mode here, not wrong,
 * which is exactly the kind that ships.
 */
IArm targetedReplaceMany(
    std::vector<Node *> &owned,
    Node *parent,
    const std::vector<size_t> &positions,
    size_t &suggestedIndexHits) {
  suggestedIndexHits = 0;
  for (size_t at : positions) {
    // The check the Yoga override makes before trusting the index. Counted here so a fallback to the
    // linear scan is VISIBLE rather than merely slow.
    if (parent->getChild(at) != nullptr) suggestedIndexHits += 1;
    auto *replacement = makeNode(owned, static_cast<int>(at), 3.0f);
    replacement->setOwner(parent);
    parent->replaceChild(replacement, at);
  }
  IArm state = readBack(parent);
  state.childrenTouched = positions.size();
  state.clones = 0;
  return state;
}

} // namespace

int main() {
  std::vector<Node *> owned;

  // Arm A starts from a standing tree whose children are owned by a PREVIOUS revision, which is the
  // situation a clone is always in — that is what makes `adoptYogaChild` clone them.
  std::vector<Node *> standingA;
  Node *previous = buildStanding(owned, standingA);
  auto *replacementA = makeNode(owned, static_cast<int>(kReplacedAt), 2.0f);
  IArm handed = listHandover(owned, previous, replacementA);

  // Arm B starts from an identical standing tree and rewrites one slot.
  std::vector<Node *> standingB;
  Node *parentB = buildStanding(owned, standingB);
  auto *replacementB = makeNode(owned, static_cast<int>(kReplacedAt), 2.0f);
  IArm targeted = targetedReplace(parentB, replacementB);

  const bool agree = sameTree(handed, targeted);
  std::printf("width %zu, one child replaced at %zu\n\n", kWidth, kReplacedAt);
  std::printf("%20s %14s %8s %9s\n", "arm", "childrenTouched", "clones", "children");
  std::printf("%20s %14zu %8zu %9zu\n", "list hand-over", handed.childrenTouched, handed.clones,
              handed.tags.size());
  std::printf("%20s %14zu %8zu %9zu\n", "targeted replace", targeted.childrenTouched,
              targeted.clones, targeted.tags.size());
  std::printf("\nsame resulting tree: %s\n", agree ? "YES" : "NO");
  std::printf("work ratio: %.1fx fewer children touched\n",
              static_cast<double>(handed.childrenTouched) /
                  static_cast<double>(targeted.childrenTouched));

  // The replaced slot must actually hold the replacement, or both arms agreeing means nothing.
  const bool replacedLanded = targeted.tags.at(kReplacedAt) == static_cast<int>(kReplacedAt) &&
      YGNodeStyleGetFlexGrow(parentB->getChild(kReplacedAt)) == 2.0f;
  std::printf("replacement landed in the slot: %s\n", replacedLanded ? "YES" : "NO");

  // ── the loop, which is what the engine actually runs ───────────────────────────────────────────
  //
  // Every position rewritten: the `retext all rows` shape, where a list's whole child set moved. If
  // the targeted path degrades here it degrades on the most common update in the benchmark.
  std::vector<Node *> standingC;
  Node *parentC = buildStanding(owned, standingC);
  std::vector<size_t> everyPosition;
  for (size_t at = 0; at < kWidth; at += 1) everyPosition.push_back(at);
  size_t hits = 0;
  IArm many = targetedReplaceMany(owned, parentC, everyPosition, hits);

  bool everySlotLanded = many.tags.size() == kWidth;
  for (size_t at = 0; at < many.tags.size() && everySlotLanded; at += 1) {
    everySlotLanded = many.tags[at] == static_cast<int>(at) &&
        YGNodeStyleGetFlexGrow(parentC->getChild(at)) == 3.0f &&
        many.ownedByParent[at];
  }

  std::printf("\n-- every position rewritten in one pass (the retext shape) --\n");
  std::printf("%20s %14zu %8zu %9zu\n", "targeted x width", many.childrenTouched, many.clones,
              many.tags.size());
  std::printf("indices stayed valid across the loop: %s\n", hits == kWidth ? "YES" : "NO");
  std::printf("every slot holds its replacement: %s\n", everySlotLanded ? "YES" : "NO");

  for (auto *node : owned) delete node;
  return agree && replacedLanded && everySlotLanded && hits == kWidth ? 0 : 1;
}
