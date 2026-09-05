---
name: symbiote-fabric-cxx-surface
description: >-
  What Fabric's C++ ACTUALLY exposes to JS and what it does internally, measured from
  react-native@0.86.0 sources. Read BEFORE proposing to remove the engine's retained tree, to
  "read the shadow tree back from C++", to patch or fork ReactCommon, to commit "directly into
  RN's internals", or before optimising the clone-bubble in commit.ts. Holds: the full 34-name
  JSI surface of nativeFabricUIManager vs the 14 we bind; the proof that NO read of structure
  exists (and what compareDocumentPosition / findNodeAtPoint / getBoundingClientRect actually
  are); ShadowNode::cloneTree + ShadowNodeFamily — the O(depth) PATH CLONE that already exists in
  C++ and is reachable from JS through setNativeProps, with its three hard limits (props-only,
  STICKY family override, _DEPRECATED); ChildrenAreShared, which proves a clone is not a deep
  copy; ShadowTree::commit's optimistic-retry transaction, which is WHY no in-place mutation API
  can exist; and Differentiator::calculateShadowViewMutations, which means Fabric ALREADY does
  the granular native update. Also: why patching RN's C++ is expensive (prebuilt
  React.xcframework) and why the viable route is ADDING a JSI host object from our own native
  module, with its cost. Trigger on 'why do we keep a shadow tree', 'read the tree from C++',
  'commit directly to Fabric', 'patch ReactCommon', 'setNativeProps', 'cloneTree',
  'ShadowNodeFamily', 'granular update', 'clone-bubble', 'O(siblings)', or any proposal to
  replace the engine with direct native calls.
---

# What Fabric's C++ exposes, and what it does on its own

Every claim here was read out of `react-native@0.86.0` on 2026-09-05. The sources are NOT in a
fresh clone (`.vendors/` is gitignored and empty). Reproduce with:

```bash
npm pack react-native@0.86.0 && tar -xzf react-native-0.86.0.tgz
# C++ lives in package/ReactCommon/react/renderer/**  (471 .cpp files, full source, not headers-only)
```

Paths below are relative to `package/ReactCommon/react/renderer/`.

## 1. The JSI surface — 34 names, and not one reads the tree

`uimanager/UIManagerBinding.cpp` exposes:

```
appendChild · appendChildToSet · createChildSet · createNode · completeRoot
cloneNodeWithNewChildren · cloneNodeWithNewChildrenAndProps · cloneNodeWithNewProps
dispatchCommand · registerEventHandler · sendAccessibilityEvent · setNativeProps
setIsJSResponder · configureNextLayoutAnimation
measure · measureInWindow · measureLayout · measureInstance
getBoundingClientRect · getRelativeLayoutMetrics · findNodeAtPoint · compareDocumentPosition
applyViewTransitionName · cancelViewTransitionName · restoreViewTransitionName
createViewTransitionInstance · startViewTransition · startViewTransitionReadyFinished
suspendOnActiveViewTransition · readyExecutor · finishedExecutor · finishedResolve
Promise · timeStamp
```

`core/engine/src/fabric.ts` binds 14 of these. **The gap is real and worth knowing** — earlier
sessions asserted the 14 were "the surface". They are not.

**But no name reads STRUCTURE.** There is no `getChildren`, no `getProps`, no `getParent`. The
read-looking names are something else:

- `getBoundingClientRect` / `getRelativeLayoutMetrics` / `measure*` — geometry of the MOUNTED
  tree, callback- or value-based, not structure.
- `compareDocumentPosition` — a computed RELATION between two nodes you already hold.
- `findNodeAtPoint` — hit-testing, takes a point, returns an instance handle you gave.

So the turn-one conclusion stands: to build the next commit you need the current handle, the
ordered child handles of every ancestor, and the previous props, and **none of it can be asked
of C++**. That is why a JS-side record exists — for React (`ReactFiberConfigFabric`) exactly as
for us.

## 2. A clone is NOT a deep copy — `ChildrenAreShared`

`core/ShadowNode.cpp:285`:

```cpp
void ShadowNode::cloneChildrenIfShared() {
  if (!traits_.check(ShadowNodeTraits::Trait::ChildrenAreShared)) return;
  traits_.unset(ShadowNodeTraits::Trait::ChildrenAreShared);
  children_ = std::make_shared<std::vector<std::shared_ptr<const ShadowNode>>>(*children_);
}
```

Children are a `shared_ptr` vector, copied lazily. Cloning a parent copies a vector of POINTERS;
an untouched subtree is literally the same objects in memory.

**So "every change rebuilds the whole tree" is false** and should not be used as an argument
against the persistent model. The real cost of one prop change is O(depth) clones plus one
pointer-vector copy per level — and, in OUR JS, the walk that finds the path.

## 3. `ShadowNode::cloneTree` + `ShadowNodeFamily` — the path clone already exists in C++

`core/ShadowNode.cpp:373`:

```cpp
std::shared_ptr<ShadowNode> ShadowNode::cloneTree(
    const ShadowNodeFamily& shadowNodeFamily,
    const std::function<std::shared_ptr<ShadowNode>(const ShadowNode&)>& callback) const {
  auto ancestors = shadowNodeFamily.getAncestors(*this);
  ...
```

Two facts that matter more than the function itself:

- **`ShadowNodeFamily` is the STABLE identity of a node across every clone.** A `ShadowNode`
  handle dies on each clone (which is why `commit.ts:1215` re-reads `record.handle` per
  imperative call); the family does not. The "stable address" that JS lacks does exist — one
  level down.
- C++ can walk ancestors and re-clone ONLY the path, given a family. That is the "change the
  propeller without rebuilding the plane" operation, and it is already written.

In 0.86 `cloneTree` is called from production code only via §4; every other caller is a unit
test (`mounting/tests/StateReconciliationTest.cpp`). **Its signature therefore has no stability
guarantee** — relevant to §6.

## 4. `setNativeProps` is that path clone, exposed to JS — with three hard limits

`uimanager/UIManagerBinding.cpp:568` → `uimanager/UIManager.cpp:438`:

```cpp
void UIManager::setNativeProps_DEPRECATED(const std::shared_ptr<const ShadowNode>& shadowNode,
                                          RawProps rawProps) const {
  auto& family = shadowNode->getFamily();
  ...
  shadowTree.commit([&](const RootShadowNode& oldRootShadowNode) {
      auto rootNode = oldRootShadowNode.cloneTree(family, [&](const ShadowNode& oldShadowNode) {
          ... return oldShadowNode.clone({.props = props}); });
      return std::static_pointer_cast<RootShadowNode>(rootNode); }, {});
}
```

One handle plus a props patch; the ancestor walk and every pointer-vector copy happen inside
C++, with **no per-level JSI crossing**. This is a native bypass for exactly the cost
`commit.ts` pays as the clone-bubble.

The limits, all from the source:

- **Props only.** No structural equivalent exists. Insert / remove / reorder has one door,
  `completeRoot` → `UIManager::completeSurface` (`uimanager/UIManager.cpp:186`), which replaces
  the ROOT's child list wholesale.
- **STICKY, and this is the sharpest trap.** `family.nativeProps_DEPRECATED` accumulates on the
  family, and `UIManager::cloneNode:152-155` merges it OVER the declarative props:
  `mergeDynamicProps(rawProps /*source*/, family.nativeProps_DEPRECATED /*patch*/, Override)`.
  A key once written through `setNativeProps` wins forever after, and there is no clear API.
  Hence the `_DEPRECATED` suffix, and hence React's 48 ms forced-resync hack
  (`symbiote-engine-core` §9).
  **The rule this implies for us: a key ever written via `setNativeProps` must ALWAYS be written
  via `setNativeProps`.** Mixing the two channels for one key is the bug.
- Our position is better than React's: the engine is its own source of truth and can keep the
  mirror in step. React's fiber cannot — that asymmetry is why the API is deprecated for React
  and may still be right for us.

## 5. Why an in-place mutation API cannot exist — the commit is a retried transaction

`mounting/ShadowTree.cpp`, `ShadowTree::commit`:

```cpp
while (true) {
  attempts++;
  auto status = tryCommit(transaction, commitOptions);
  if (status != CommitStatus::Failed) return status;
  react_native_assert(attempts < 1024);
}
```

The transaction lambda **may run several times**, re-based on a fresher revision. This is what
makes background-thread commit and off-thread Yoga layout safe, and it is why the API takes
"give me a new root" rather than "mutate this node". A mutable API is not a missing feature; it
is incompatible with the concurrency model. Previously argued here from first principles — now
verified.

## 6. Patching vs extending

**Patching is expensive.** RN 0.86 links a PREBUILT `React.xcframework`; editing ReactCommon
requires `RCT_USE_PREBUILT_RNCORE=0` and a from-source build (~30 min per configuration; see
root `CLAUDE.md` on the prebuilt flavors).

**Extending is the viable route and is NOT a fork.** Ship a native module beside RN (we already
ship native shims in `packages/android`), link against React's headers, take the `UIManager&`,
install our own JSI host object exposing what is missing — a non-deprecated family-based path
clone, and a structural equivalent.

Cost, stated honestly: C++ on two platforms inside our package, coupled to RN's INTERNAL C++
API, which carries no stability guarantee (§3 — `cloneTree` has only test callers). This does
not violate `<native_core_is_untouched>` (nothing is forked or patched) but it is a standing
maintenance obligation on every RN bump.

## 7. There are TWO diffs today. One is ours and removable; the other is not

```
JS  our commit walk (commit.ts)  finds what changed in the retained record → builds a new root
C++ Differentiator::calculateShadowViewMutations (mounting/Differentiator.cpp:1641)
                                 compares two revisions → emits view mutations
```

**Fabric already does the granular native update** — that half was never ours and never a
problem. Our walk is the redundant one, because the adapter ALREADY knew what changed and we
discarded that knowledge into a boolean (`propsDirty`) and rediscovered it (`VISITED 1046` for
two changed nodes on a 1 000-row Select).

So the target is not "remove the record" (impossible — §1) and not "let Fabric diff for us"
(it already does). It is: **keep the record, delete the WALK.**

## 8. Open, in priority order

1. **Edit queue instead of the walk.** Pure engine, no native work. An adapter mutation records
   the edit; commit drains it. `VISITED` should collapse to the number of touched nodes.
   Measure on the tags branch — the engine's share of a frame is ~20% today and rises to ~33%
   once component wrappers are gone (arithmetic on measured numbers, not a measurement).
2. **`setNativeProps` arm for prop-only rows.** Already bound, zero native work. Compare against
   the clone-bubble on `Select` / `Partial update`. Honour the §4 stickiness rule and gate it
   per key.
3. **Mirror fields on the framework's own object** (VNode, block) so no engine object is
   allocated per node. Saves allocation, not the walk — sequence it after 1.
4. **Own JSI host object** (§6) only if 1-3 leave a measured residual that needs it.
