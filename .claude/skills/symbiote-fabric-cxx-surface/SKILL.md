---
name: symbiote-fabric-cxx-surface
description: >-
  What Fabric's C++ ACTUALLY exposes to JS and what it does internally, measured from
  react-native@0.86.0 sources. Read BEFORE proposing to remove the engine's retained tree, to
  "read the shadow tree back from C++", to patch or fork ReactCommon, to commit "directly into
  RN's internals", or before optimising the clone-bubble in commit.ts. Holds: the full 35-name
  JSI surface of nativeFabricUIManager vs the 14 we bind; the proof that no read C++ exposes
  answers about an UNCOMMITTED tree — findShadowNodeByTag_DEPRECATED does read the committed one,
  O(n) per call (and what compareDocumentPosition / findNodeAtPoint / getBoundingClientRect
  actually are); ShadowNode::cloneTree + ShadowNodeFamily — the O(depth) PATH CLONE that already exists in
  C++ and is reachable from JS through setNativeProps, with its three hard limits (props-only,
  STICKY family override, _DEPRECATED); ChildrenAreShared, which proves a clone is not a deep
  copy; ShadowTree::commit's optimistic-retry transaction, which is WHY no in-place mutation API
  can exist; and Differentiator::calculateShadowViewMutations, which means Fabric ALREADY does
  the granular native update. Also: why patching RN's C++ is expensive (prebuilt
  React.xcframework) and why the viable route is ADDING a JSI host object from our own native
  module, with its cost. **AND §8 IS THE WORK ORDER for removing the engine's JS shadow tree —
  what has landed, what is next, and what each item is blocked on. Read it before starting or
  planning any of that work; do not re-derive the sequence.** Trigger on 'work order', 'what is
  next on the skeleton', 'remove the shadow tree', 'edit buffer', 'drain the buffer',
  'why do we keep a shadow tree', 'read the tree from C++',
  'commit directly to Fabric', 'patch ReactCommon', 'setNativeProps', 'cloneTree',
  'ShadowNodeFamily', 'granular update', 'clone-bubble', 'O(siblings)', or any proposal to
  replace the engine with direct native calls.
---

# What Fabric's C++ exposes, and what it does on its own

Every claim here was read out of `react-native@0.86.0`, first on 2026-09-05 and re-verified
against the sources the same day (see the corrections marked RE-MEASURED / CORRECTED below —
three C++ facts and one grep result were wrong).

**The `npm pack` step this section used to prescribe is unnecessary: the C++ ships in the npm
package, so an ordinary `pnpm install` already puts it on disk.**

```bash
ls node_modules/react-native/ReactCommon/react/renderer   # 274 .cpp here, 471 across ReactCommon
                                                          # full source, not headers-only
```

Paths below are relative to `node_modules/react-native/ReactCommon/react/renderer/`. Where a claim
cites `Libraries/` or `src/`, that is JS and the root is `node_modules/react-native/`.
`.vendors/react-native` is gitignored and empty, and nothing here needs it.

**Sections are in measurement order, not reading order, and their numbers are load-bearing — nine
files outside this skill cite `§9` by number, so nothing here may be renumbered.** If you came for
the plan rather than for the C++: **§8, at the END of this file, is the WORK ORDER** — what has
landed, what is next, and what each item waits on. §9 is the contract it implements. Everything
before them is the evidence both rest on.

## Re-verification, 2026-09-05 — what a second pass over the sources moved

Everything below was read a second time, straight out of `node_modules/react-native`. Recorded as
a table because the useful part is the RATIO: most of the file survived unchanged, and the four
that did not were all found the same way — by running the probe instead of quoting its result.

```
CHANGED
  §1   the name list          5 names were not on the binding, 6 real ones missing. 34 -> 35
  §1   "not one reads"        findShadowNodeByTag_DEPRECATED does. Conclusion survives, wording did not
  §3   cloneTree's callers    THREE production callers, not zero. §6 and §6a both quoted the zero
  §4   sticky semantics       two merges, not one. Declarative wins when the bag NAMES the key
  §7b  "zero hits"            not zero — and the hits strengthen the section
  intro  npm pack             unnecessary; the C++ ships in the npm package

UNCHANGED, re-read line by line
  the 14 we bind · ChildrenAreShared @285 · cloneTree @373 · setNativeProps @568 -> UIManager:438
  the sticky merge @152-155 · getAncestors' two phases · cloneMultiple @442 + both callers
  registerCommitHook UIManager.h:101-102 and public · UIManagerCommitHook's header comment
  getShadowTreeRegistry @211 public · getNewestCloneOfShadowNode @110 public
  layoutIfNeeded @409 inside tryCommit · layoutMetrics inside ShadowView::operator==
  Differentiator @1641 · NativeDOM's spec text verbatim · React's renderer never calls it
  ReactFabric-dev.js:15963 · MountingCoordinator holds committed revisions only
```

**Two of the four errors came from one grep habit**, and it is the one
`.claude/rules/verify-the-deciding-side.md` already names: a pattern that cannot match every
candidate reports unanimity rather than a miss. `methodName == "[A-Za-z]+"` silently drops the six
underscored names — including the one that reads the tree — and a caller census that stops at the
first screen reports whatever sorts first, which put `mounting/tests/` ahead of `uimanager/`.
**Count the candidates and count the matches; a survey that does not account for every candidate
has not run.**

The third came from the opposite habit: §4's sticky rule was a one-line summary of a two-merge
function, and the summary predicted the wrong behaviour for exactly the case our own `diffProps`
does not produce. **A mechanism compressed to a slogan is a mechanism nobody re-reads.**

None of it moved an item or a dependency in §8.

## 1. The JSI surface — 35 names, and ONE of them reads the tree

**RE-MEASURED 2026-09-05 against the sources, and the previous list was wrong in BOTH directions —
five names that are not on the binding, six real ones missing.** The list below is the complete
dispatch of `UIManagerBinding::get` (`uimanager/UIManagerBinding.cpp:184`, ending in a fallthrough
`return jsi::Value::undefined()` at :1221), so it is exhaustive by construction:

```
appendChild · appendChildToSet · createChildSet · createNode · completeRoot
cloneNodeWithNewChildren · cloneNodeWithNewChildrenAndProps · cloneNodeWithNewProps
dispatchCommand · registerEventHandler · sendAccessibilityEvent · setNativeProps
setIsJSResponder · configureNextLayoutAnimation
measure · measureInWindow · measureLayout · measureInstance
getBoundingClientRect · getRelativeLayoutMetrics · findNodeAtPoint · compareDocumentPosition
applyViewTransitionName · cancelViewTransitionName · restoreViewTransitionName
createViewTransitionInstance · startViewTransition · startViewTransitionReadyFinished
suspendOnActiveViewTransition
findShadowNodeByTag_DEPRECATED                                        <- reads the tree, see below
unstable_getCurrentEventPriority · unstable_DefaultEventPriority
unstable_DiscreteEventPriority · unstable_ContinuousEventPriority
unstable_IdleEventPriority
```

Reproduce it, and note that the naive pattern is what produced the wrong list:

```bash
grep -oE 'methodName == "[A-Za-z_]+"' UIManagerBinding.cpp | sort -u | wc -l   # 35
grep -oE 'methodName == "[A-Za-z]+"'  UIManagerBinding.cpp | sort -u | wc -l   # 29 — drops every
                                                                               # underscored name
```

**The five that were on the old list and are NOT names on the binding**, all from a grep that
swept up every `forAscii` and every quoted string in the file:

```
readyExecutor · finishedExecutor · finishedResolve   jsi::Function NAMES for Promise executors
                                                     created INSIDE startViewTransition's body
Promise                                              runtime.global().getPropertyAsFunction(…)
timeStamp                                            a key set on an EVENT payload object (:150)
```

`core/engine/src/fabric.ts` binds **14** — createNode, cloneNodeWithNewProps,
cloneNodeWithNewChildren, cloneNodeWithNewChildrenAndProps, createChildSet, appendChild,
appendChildToSet, completeRoot, registerEventHandler, dispatchCommand, sendAccessibilityEvent,
measure, measureInWindow, measureLayout. (`supportsCloneWithChildren` on `IFabricSlot` is our own
arity probe, not a host name.) **The gap is real and worth knowing** — earlier sessions asserted
the 14 were "the surface". They are not.

### `findShadowNodeByTag_DEPRECATED` — the read this skill said did not exist

**CORRECTED 2026-09-05. The claim below used to read "not one name reads the tree", and it was the
sentence the whole first turn rested on.** `UIManagerBinding.cpp:795` dispatches to
`UIManager::findShadowNodeByTag_DEPRECATED` (`UIManager.cpp:528`), which does this:

```cpp
shadowTreeRegistry_.enumerate([&](const ShadowTree& shadowTree, bool& stop) {
  rootShadowNodeHolder = shadowTree.getCurrentRevision().rootShadowNode;   // current revision
  ...
  shadowNode = findShadowNodeByTagRecursively(child, tag);                 // full recursive walk
});
```

and the binding returns `valueFromShadowNode(runtime, shadowNode)` — a real node out of the
committed tree, from `nativeFabricUIManager` itself, with no `NativeDOM` involved.

**It changes nothing about the conclusion, and the reasons are the same two §1a gives for
`NativeDOM`, plus a third that is worse.** It reads the CURRENT REVISION, so a node created or
moved but not committed is invisible. It gives you a NODE, not navigation — no children, no
parent, no props diff. And it is an O(n) recursive search of every registered surface PER CALL,
where the thing it would replace is an O(1) property read.

So the honest statement is not "C++ exposes no read" but **"every read C++ exposes answers about
the COMMITTED past, and a reconciler navigates the tree it is mid-way through building."** That
distinction is the load-bearing one, and it survives both this name and §1a.

**CORRECTED 2026-09-05 — read §1a before quoting the next paragraph.** `nativeFabricUIManager`
has no structural read, and that is what the paragraph below establishes. It does NOT mean React
Native has none: a SEPARATE TurboModule, `NativeDOM`, exposes `getChildNodes` / `getParentNode` /
`getElementById` / `isConnected`. Stating "no read of structure exists" without that qualifier was
wrong for three days of this investigation.

**No name on this binding NAVIGATES structure**, the one above included. There is no
`getChildren`, no `getProps`, no `getParent`. The other read-looking names are something else
again:

- `getBoundingClientRect` / `getRelativeLayoutMetrics` / `measure*` — geometry of the MOUNTED
  tree, callback- or value-based, not structure.
- `compareDocumentPosition` — a computed RELATION between two nodes you already hold.
- `findNodeAtPoint` — hit-testing, takes a point, returns an instance handle you gave.

So the turn-one conclusion stands, with its reason restated: to build the next commit you need the
current handle, the ordered child handles of every ancestor, and the previous props **as they are
mid-edit**, and nothing C++ exposes answers about a tree that has not been committed. That is why
a JS-side record exists — for React (`ReactFiberConfigFabric`) exactly as for us.

## 1a. `NativeDOM` — RN DID build the browser paradigm, but only its READ half

`src/private/webapis/dom/nodes/specs/NativeDOM.js`, a TurboModule separate from
`nativeFabricUIManager`:

```
getChildNodes(ref) -> ReadonlyArray<InstanceHandle>     Node.prototype.childNodes
getParentNode(ref) -> ?InstanceHandle                   Node.prototype.parentNode
getElementById(rootTag, id) -> ?InstanceHandle          Document.prototype.getElementById
isConnected(ref) -> boolean                             Node.prototype.isConnected
```

RN's own comments cite MDN for each. So "we cannot read the tree" is false, and the intuition
that RN set out to put the browser on top of native is literally correct.

**Three facts bound what it is good for, and all three are from the source:**

- **It reads the CURRENT REVISION.** The spec text: *"If a version of the given shadow node is
  present in the current revision of an active shadow tree, it returns an array of instance
  handles of its children. Otherwise, it returns an empty array."* A node created but not
  committed, or moved but not committed, answers empty/null.
- **The class is called `ReadOnlyNode`**, and it has NO mutation methods — no `appendChild`, no
  `insertBefore`, no `setAttribute`. Its read surface is wider than the four names above
  (`firstChild`, `lastChild`, `nextSibling`, `previousSibling`, `parentElement`, `contains`,
  `getRootNode`, `hasChildNodes`, `textContent`, `nodeName`/`nodeType`/`nodeValue`), and every one
  of them is a getter.
- **The TurboModule is not purely a read API, though its STRUCTURAL half is.** `NativeDOM` also
  carries `setNativeProps`, `setPointerCapture`, `releasePointerCapture` and `linkRootNode` — 21
  names in all. None of them inserts, removes or reorders a node, which is the claim that
  matters; "only its READ half" in this section's title is true of structure and not of the
  module.
- **React's own renderer never calls it.** `grep -rl "getChildNodes|getParentNode"
  Libraries/Renderer/` returns nothing. The only consumers are `ReadOnlyNode.js`,
  `ReadOnlyElement.js` and `internals/Traversal.js` — the app-facing DOM API.

**The inference this supports, and it explains the whole shape of the problem.** React needs no
host navigation because it keeps fibers (our `adapters/react/src/host-config.ts` has none either).
So Fabric could ship a commit-only host: its one client never asked the host where anything was.
The DOM reads arrived later, for app code. The other four frameworks' renderer seams DO ask, which
is why they strain against a host built for a client that does not.

Consequence for us: `getChildNodes` is legitimate for app-facing use (a `ref.childNodes` we could
expose on all five adapters) and unusable for RECONCILIATION, because a reconciler navigates the
tree it is mid-way through building.

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

**CORRECTED 2026-09-05 — this section used to say `cloneTree` has only test callers, and that was
measured with a grep that read the test files first and stopped.** It has THREE production callers
in 0.86, and one of them is core machinery:

```
uimanager/UIManager.cpp:465          setNativeProps_DEPRECATED   the §4 path
uimanager/UIManager.cpp:401          updateState                 EVERY native state update
components/text/ParagraphShadowNode.cpp:399                       laying out inline attachments
```

`UIManager::updateState` is how a ScrollView's content offset, a TextInput's state and a
Paragraph's measurement reach the tree, so this is not a corner. **Two claims that were built on
the false version have to go with it**: that the signature "has no stability guarantee" (§6 quoted
it), and §6a's ranking of `cloneMultiple` as "markedly more stable than `cloneTree`". Both are now
production APIs on RN's own hot paths, which if anything strengthens §6a's case rather than
weakening it.

The general shape, and it is this repo's own rule pointed at a grep: **a caller census that stops
at the first screen of hits reports whatever sorts first**, and `mounting/tests/` sorts before
`uimanager/`.

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
- **STICKY — and RE-READ 2026-09-05, because the mechanism is subtler than "it wins forever" and
  the difference decides how the rule is stated.** `family.nativeProps_DEPRECATED` accumulates on
  the family, and `UIManager::cloneNode` (`UIManager.cpp:108`) runs TWO merges on every
  declarative clone of a family that has ever seen a `setNativeProps`:

  ```cpp
  // :138  refresh the sticky patch from the declarative bag — Ignore ADDS NOTHING
  family.nativeProps_DEPRECATED = mergeDynamicProps(*family.nativeProps_DEPRECATED /*source*/,
                                                    rawProps /*patch*/, NullValueStrategy::Ignore);
  // :152  then let the sticky patch override the declarative bag
  auto finalProps = mergeDynamicProps(rawProps /*source*/,
                                      *family.nativeProps_DEPRECATED /*patch*/, Override);
  ```

  `Ignore` is documented in `core/DynamicPropsUtilities.h` as "in case key is missing in source,
  value from patch will be ignored", and the implementation is a `continue` on
  `source.find(key) == end`. So for a key K that `setNativeProps` has written:

  ```
  the declarative bag NAMES K    sticky[K] := declarative, then final[K] = sticky[K]   DECLARATIVE WINS
  the declarative bag OMITS K    sticky[K] stands,        then final[K] = sticky[K]    STICKY WINS, forever
  ```

  **And the second row is OUR normal case, which is what makes this load-bearing rather than
  academic.** `diffProps` (`core/engine/src/commit.ts`) sends a MINIMAL DIFF — only keys whose
  value changed, plus removed keys as `null` — because re-sending an unchanged key re-invokes its
  native setter. So an unchanged declarative value is ABSENT from every clone payload, and a key
  `setNativeProps` once wrote is shadowed until something changes it declaratively. There is no
  clear API. Hence the `_DEPRECATED` suffix, and hence React's 48 ms forced-resync hack
  (`symbiote-engine-core` §9).

  **The rule is unchanged and its reason is sharper: a key ever written via `setNativeProps` must
  ALWAYS be written via `setNativeProps`.** The bug is not the two channels fighting — they do not
  fight, the sticky patch simply wins whenever our diff has nothing to say about the key.
- Our position is better than React's: the engine is its own source of truth and can keep the
  mirror in step. React's fiber cannot — that asymmetry is why the API is deprecated for React
  and may still be right for us.

## 5. Why an in-place mutation API cannot exist — the commit is a retried transaction

`mounting/ShadowTree.cpp`, `ShadowTree::commit`:

```cpp
while (true) {                                        // the non-flagged branch
  attempts++;
  auto status = tryCommit(transaction, commitOptions);
  if (status != CommitStatus::Failed) return status;
  react_native_assert(attempts < 1024);
}
```

Re-read 2026-09-05: there are now TWO branches, and the retry is in both. Under
`ReactNativeFeatureFlags::preventShadowTreeCommitExhaustion()` the loop is BOUNDED
(`MAX_COMMIT_ATTEMPTS_BEFORE_LOCKING`) and then takes `revisionMutexRecursive_` for one final
`tryCommit`; without the flag it is the unbounded loop above. Either way the transaction lambda
**may run several times**, re-based on a fresher revision. This is what
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
API, which carries no published stability guarantee. **The parenthetical that used to sit here —
"§3, `cloneTree` has only test callers" — was false and is corrected in §3**: both `cloneTree` and
`cloneMultiple` are on RN's own production paths, so the exposure is smaller than this section
first claimed. It still does not violate `<native_core_is_untouched>` (nothing is forked or
patched), and it is still a standing maintenance obligation on every RN bump.

## 6a. The family layer, `cloneMultiple`, and why NO patch is needed

Measured 2026-09-05, and it supersedes §6's framing: the extension seam is PUBLIC and RN uses it
itself, so "patch ReactCommon" was never the question.

**`ShadowNodeFamily` carries the parent chain.** `core/ShadowNodeFamily.cpp`, `getAncestors`:

```cpp
auto family = this;
while ((family != nullptr) && family != ancestorFamily) {
  families.push_back(family);
  family = family->parent_.lock().get();   // parent is ON THE FAMILY, stable across clones
}
```

Phase 1 climbs to the root in O(depth) with no search. **Phase 2 then walks DOWN and linearly
scans each level's children to match a family** — so `getAncestors` is O(depth x siblings), the
same asymptotics as our JS walk. Moving it to C++ is a CONSTANT-factor win (pointer compares, no
JSI crossings), not an algorithmic one. Do not sell it as the latter.

**`ShadowNode::cloneMultiple(families, callback)`** (`core/ShadowNode.cpp:442`) takes a SET of
families, builds a `childrenCount` map and makes ONE recursive pass over the union of the paths.
That is the drain of an edit queue, already written. It is not dead code:
`animationbackend/AnimationBackend.cpp:176` and `AnimationBackendCommitHook.cpp:39` use it for
per-frame updates — RN's own hottest path. **The comparison that used to close this paragraph —
that this makes it "markedly more stable than `cloneTree`, which has only test callers" — is
WITHDRAWN, see §3.** `cloneTree` has three production callers, `UIManager::updateState` among
them. Both are production APIs and neither is the more exposed of the two.

**The seam is public.** `uimanager/UIManager.h:101-102`:

```cpp
void registerCommitHook(UIManagerCommitHook &commitHook);
void unregisterCommitHook(UIManagerCommitHook &commitHook);
```

and `uimanager/UIManagerCommitHook.h` says in its own header comment: *"Implementing a commit
hook allows to observe and alter Shadow Tree commits."* `shadowTreeWillCommit` hands you the old
root, the new root, and the right to return your own.

So a no-patch design exists: our native module takes `shadowNode->getFamily()` (public), hands JS
an opaque family handle, receives an edit queue in ONE JSI call, and applies it with
`cloneMultiple` inside a registered commit hook. Nothing forked, nothing patched.

### The floor is NOT zero — name it before designing

To say "change prop X on node N" the adapter must NAME N. The irreducible JS-side state is:

```
one family handle per node    — and it can live on the framework's OWN object (VNode, block),
                                so no engine object is allocated at all
the root's child list         — one array, to have something to commit
viewName per node             — only for our RCTText <-> RCTVirtualText rule
```

That is a mirror of the tree collapsing into an ADDRESS BOOK: no children arrays, no parent
pointers, no props snapshot. It is exactly what a browser variable holding an element is. It is
not zero, and a plan that promises zero is wrong.

### "Read native" is the wrong principle even once we CAN

Inside our own C++ module we could read anything. We must not. Marshalling children back over JSI
per commit is O(n) where holding one handle is O(1) — strictly worse than today. The rule, NARROWED 2026-09-05 after it was challenged and found over-broad: **never read native
for state the buffer has already changed.** Reading committed facts is legitimate and we already
do it — `measure`, `measureInWindow`, `getBoundingClientRect`, and (§1a) `getChildNodes` for
app-facing use. The boundary is not "native", it is "has my buffer changed what I am asking
about".

Closest thing to a real read that exists, and it solves a different problem:
`UIManager::getNewestCloneOfShadowNode(const ShadowNode&)` is public and resolves a STALE handle
to the current clone.

### What the hook cannot do

Create nodes. `createNode` stays per-node from JS and mounting still goes through
`completeSurface`. **So this whole route leaves the CREATE path untouched — and create-shaped rows
are exactly where we sit at parity with stock (React 1.03x, Angular 1.43x), while the rows it does
speed up (Select / Swap / Remove / Partial) are ones we already win by 10-15x.** The native module
is therefore an ARCHITECTURAL move (the record collapses to an address book, a class of
JS-vs-framework divergence bugs disappears), not a performance one. Decide which goal is being
bought before costing it.

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

## 7a. "Commands instead of a diff" — the ingress can, the egress never can

A recurring proposal, and it conflates two stages. **We do not send a diff today**: we send a
TREE, and C++ computes the diff. So the question splits:

```
ingress   what JS hands native          today: a new tree      as commands: YES, and no patch
egress    what the mounting layer eats  mutations from a diff  as commands: NEVER
```

The ingress is §6a: buffer commands in our own module, apply them with `cloneMultiple` inside a
registered commit hook. Public API throughout.

**The egress cannot be commands, and the reason is Yoga, not API taste.** `mounting/ShadowTree.cpp:409`,
inside `tryCommit`:

```cpp
newRootShadowNode->layoutIfNeeded(&affectedLayoutableNodes);
```

Layout runs INSIDE the commit, on the NEW root, before the revision is published. And
`ShadowView::operator==` (`mounting/ShadowView.cpp:34`) — the equality the differ decides
mutations by — has `layoutMetrics` inside its `std::tie`, beside `props`, `state` and
`eventEmitter`.

So the differ compares not what you CHANGED but what RESULTED after Yoga. One command
(`opacity = 0.5` on one node) can produce fourteen `Update` mutations because fourteen siblings
got new frames. **A command list formed in JS could not have named them — those frames did not
exist yet.**

The differ is therefore not bookkeeping we duplicate. It is where Yoga's output enters. Patching
it away means reimplementing incremental layout reconciliation — taking on RN's hardest layer in
the name of removing ours.

## 7b. Where the PENDING tree lives — searched exhaustively, 2026-09-05

The question that decides whether navigation can be answered by native: does C++ retain a
not-yet-committed tree between commits? Every plausible hiding place, checked:

```
ShadowTree private state          currentRevision_, currentReactRevision_,
                                  reactRevisionToBePromoted_, mutexes, mountingCoordinator_    no
LazyShadowTreeRevisionConsistency capturedRootShadowNodesForConsistency_ — FROZEN COMMITTED
Manager                           roots, lockRevisions()/unlockRevisions(). The opposite of
                                  pending: it pins the past so reads stay consistent            no
AnimationBackend                  animatedPropsRegistry_ — a registry of EDITS; commits
                                  immediately (AnimationBackend.cpp:170)                        no — it is a command buffer
cloneTree / cloneMultiple         return a new root                                             YES, but see below
React's own renderer              createChildSet -> appendChildToSet ->
                                  completeRoot(tag, newChildren)  ReactFabric-dev.js:15963      builds it IN JS, from fibers
grep pending|staging|inProgress|
uncommitted over mounting/        MountingCoordinator::hasPendingTransactions, lastRevision_
                                  — POST-commit, see below                                      no
```

**CORRECTED 2026-09-05: that last row read "zero hits" and it is not zero.** `mounting/` does
contain `hasPendingTransactions`, `hasPendingTransactionsOverride_` and `lastRevision_`
(`MountingCoordinator.{h,cpp}`) — and reading them makes the section's conclusion STRONGER rather
than weaker, which is why the wrong evidence was worth correcting rather than deleting. Both
`baseRevision_` and `lastRevision_` are typed `ShadowTreeRevision`, i.e. already-committed trees,
and the header says what "pending" means here: *"transactions waiting to be consumed and mounted
on the host platform"*. So the one thing in the mounting layer that carries the word is
DOWNSTREAM of commit — a committed revision awaiting mount — which is the mirror image of the
pending tree this search was for. A grep reported as zero when it is not zero is the more
dangerous half: it reads as a search that covered the space.

**`cloneMultiple` does produce a tree before commit — as a LOCAL VALUE inside one transaction.**
`tryCommit` builds it, runs Yoga on it, then publishes or discards it on retry. It is not a
staging area that accumulates edits between commits. Between commits a surface has exactly one
tree in C++: the committed one.

And the decisive precedent: **RN's own client builds the pending tree in JS.** In persistent mode
the tree-under-construction belongs to the committer by contract, which is why `completeRoot`
takes a finished child set.

### Correction: `getShadowTreeRegistry()` IS public

`uimanager/UIManager.h:211` — `const ShadowTreeRegistry &getShadowTreeRegistry() const;`. An
earlier note here said the registry was private and unreachable; that was wrong. A native module
can visit any surface's `ShadowTree` and commit arbitrary transactions with no patch, exactly as
`AnimationBackend.cpp:170` does.

### So there are TWO viable designs, both correct, both patch-free

```
(1) JS skeleton    parent + children + address in JS; buffer drains into the clone-bubble
(2) C++ pendingRoot our own native module retains pendingRoot_ per surface, applies each command
                    with cloneMultiple, answers navigation from it, commits on flush
```

(2) is what leaves ONLY the buffer on the JS side, and it is the chosen direction (2026-09-05).

### This CONTRADICTS §9's correction, and the contradiction is resolved by step 0 — read both

Both were written on 2026-09-05 and they do not agree. Recorded rather than silently reconciled,
because a reader will otherwise quote whichever half suits the instruction in front of them — which
is exactly what nearly happened on 2026-09-05, when a session building the seam took §7b's "chosen
direction" and wrote a design §6a rules out.

```
§9 CORRECTED   "only a buffer on our side" is DEAD; a navigable node stays.
               "the navigable structure LIKELY stays in JS"           -> design (1)
§7b            design (2) "is the chosen direction"                   -> design (2)
```

**They are not equally weighted, and the tie-break is in §8 rather than in either section.** §9's
correction hedges on cost, not on capability — "likely", and its stated reason is that child
navigation would be a per-call JSI read. §8's item 0 says the crossing constant is what decides
between the two branches at all, and it has NOT been run. So §9 is design (1) CONDITIONAL on step 0 coming back expensive, and
§7b is design (2) conditional on it coming back cheap. Neither is a standing decision; both are
branches off one unmeasured number, and the number is still unmeasured.

**What is NOT conditional, and holds under either branch:**

- The buffer must carry the OPERATIONS, not merely which nodes were touched. Under (1) the drain
  needs them to derive the new child order; under (2) `pendingRoot_` must be REBASED by re-applying
  the command log inside a retried commit lambda (§5), so it is a memo of the buffer and useless
  without one. Same requirement, two different reasons.
- `NativeDOM` is not the mechanism for either. It is app-facing (§1a) and per-commit child reads are
  strictly worse than a handle (§6a). A design naming it has taken a wrong turn.
- The floor is not zero (§6a): a family handle per node, the root's child list, and `viewName` per
  node survive both branches. The handle can ride on the framework's own object, so nothing
  TREE-SHAPED stays ours — but "ours by ownership" and "does not exist" are different claims and only
  the first is available.

So the next decision is not "which design", it is "run step 0".

**Its cost is a per-call JSI crossing plus a family->node resolution** whose phase 2 linearly
scans each level's children (§6a). Arithmetic on this repo's own measured constant (~1.5 us per
crossing): Solid's `cleanChildren` on 1 000 children is ~1 000 crossings ~= 1.5 ms plus 1 000
resolutions, against microseconds for a JS array read. **That is arithmetic, not a benchmark** —
and pricing it is step 0 below, because it sizes the whole design.

**The retry semantics force the buffer to remain the source of truth.** `ShadowTree::commit` may
re-run its lambda against a fresher root (§5), and another writer (an animation commit, a state
update) can land in between — so a `pendingRoot_` built against an older root must be REBASED. The
only way to rebase is to re-apply the command log inside the lambda. `pendingRoot_` is therefore a
memo of the buffer, never a replacement for it, which is consistent with "only the buffer is
ours".

## 9. The target contract — DECIDED 2026-09-05, implementation order deliberately staged

The goal is architectural, not performance (§6a's last paragraph): adapters must drive a HOST,
never our record. Whether the engine keeps a per-node handle internally is an implementation
detail the adapter never sees. Those two were conflated for several rounds of discussion; they
are not the same requirement, and only the first is the goal.

The seam an adapter sees:

```
attach(frameworkObject) -> address        an address, not our node type
edit(address, key, value)                 O(1) at the call site
insert / remove / move(parent, child, i)  O(1) at the call site
flush()                                   transaction boundary
```

This is the DOM's shape (`el.setAttribute`, `parent.insertBefore`). The adapter uses its own
structure, its own scheduler, its own batching; the engine never diffs, never searches, never
decides what changed — it was told.

**Why the seam is the fix rather than the problem.** An adapter already speaks this way today:
`setProp(node, 'color', 'red')` names the node and the key exactly. The engine then erases that
precision into a boolean (`propsDirty`) and rediscovers it by walking — `VISITED 1046` for two
changed nodes. The defect is a LOSSY seam, not the existence of one. Making it lossless is the
work.

**`flush()` stays, and it is the one place the contract cannot be browser-shaped.** The host is
commit-only and `ShadowTree::commit` is a retried transaction (§5). That is RN's constraint, not
ours — everything else on this list was ours.

### CORRECTED 2026-09-05, before any code was written: the address must be NAVIGABLE

The section below was written as "only the buffer stays ours". **That is wrong, and it was caught
by reading the five adapters' renderer seams rather than by reasoning.** Four of five frameworks'
OFFICIAL renderer contracts require a navigable host tree:

```
solid     getParentNode / getFirstChild / getNextSibling   adapters/solid/src/renderer.ts (nodeOps)
vue       parentNode / nextSibling                         adapters/vue/src/renderer/index.ts:175,179
angular   parentNode / nextSibling                         adapters/angular/src/renderer/index.ts:346,350
svelte    parentNode + firstChild/nextSibling as REAL
          PROTOTYPE GETTERS                                adapters/svelte/src/dom-shim/shim-node.ts:67,193-202
react     none — React navigates its own fibers            adapters/react/src/host-config.ts
```

In a browser the DOM answers those. Fabric cannot (§1: no read of structure exists). So **the
retained tree is not a drawing we invented — it is the DOM that Fabric does not ship**, and
deleting it does not respect the frameworks' engineering, it breaks the very seams that
engineering is expressed through. Solid's own nodeOps comment says the runtime "re-derives
positions through these two lookups".

React is the outlier precisely because it keeps fibers, which is why a React-only intuition about
this ("the tree is redundant") does not survive contact with the other four.

**What survives of the goal, and what does not:**

```
adapters stop seeing OUR node type      SURVIVES — the host is opaque AND navigable, i.e. DOM-shaped
deleting the WALK                        SURVIVES ENTIRELY — orthogonal to navigation; this was always
                                         the real win (VISITED 1046 for two changed nodes)
"only a buffer on our side"              DEAD. A navigable node stays, plus the buffer.
a fully native address (step 2)          NARROWED. C++ can answer parent (family->parent_) but child
                                         navigation would be a per-call JSI read — the thing §6a says
                                         never to do. The navigable structure likely stays in JS.
```

So the target is: **the engine is the DOM Fabric lacks — a navigable retained host — plus a
lossless edit buffer.** Adapters see a DOM-shaped opaque interface
(`parentOf` / `firstChildOf` / `nextSiblingOf` alongside `edit` / `insert` / `remove` / `move` /
`flush`). That is a closer expression of "give each framework the host it expects" than the
buffer-only design was.

### The address — the address rides on the adapter, and it is navigable

The record collapses from a MIRROR into a navigable node plus a buffer — two things with different lifetimes, and conflating them breaks the
design on the first frame:

```
edit buffer    lives from a write until flush()      self-clearing on drain
address        lives as long as the node             released only on removeChild / unmount
```

Clearing addresses with the buffer leaves the next command with nothing to name.

The address is stamped onto the object the ADAPTER already holds, so nothing tree-shaped remains
on our side. Honest limit on "only the buffer is ours": the address is still an object WE
allocate and hand over — one opaque handle per node instead of a tree node. It stops being ours
by ownership, not by existing.

**Where it lives is a PER-ADAPTER fact and must not enter the shared contract**
(`adapter-parity-audit`, "a fact that varies PER ADAPTER must not enter the shared spec"). Shared:
the buffer, the commands, `flush()`. Per-adapter: which object carries the field.

#### The three ways the address is actually lost

- **The framework recreates the object.** Vue mints a NEW VNode every render; only what Vue
  carries forward survives (`n2.el = n1.el`). So stamp the object returned from `createElement`,
  never the vnode. Verify this per adapter rather than assuming — each renderer decides what it
  carries across a patch.
- **The host object gets wrapped.** Vue `reactive()` / deep `ref` yields a Proxy and identity is
  gone — the documented classic (`vue-adapter-reactivity`), today caught because `committedOf` is
  a guarded function and not a bare property read. **An equivalent guard must survive this
  redesign**, or the failure turns silent.
- **A keyed remount.** The framework calls `createElement` again for a node it considers "the
  same"; the old address must be released or a family handle leaks on the C++ side.

#### The requirement, stated so it can be tested

```
mint     createElement -> address     exactly ONE place
release  removeChild / unmount        exactly ONE place
guard    edit(x) with a non-address   throws or logs — NEVER a silent no-op
```

The last line is from this repo's own history: a silent no-op presents as "works on React, dead
on Vue" and costs days. Each adapter owes one test — "the address survives a re-render" — because
the mechanism that would break it is that adapter's own.

### Order — the contract ships BEFORE any C++

1. **Introduce the contract in JS.** The edit queue IS its implementation. Adapters stop seeing
   the retained tree; the architectural goal lands with zero native work.
2. **Optionally swap the implementation to native later** — `cloneMultiple` in a commit hook, on
   the batch step 1 already produces.

The API an adapter sees is IDENTICAL under both, so step 2 changes no adapter code. This is what
decouples the architectural goal from a standing C++ maintenance obligation: the goal is reached
at step 1, and native becomes an optimisation under the same seam rather than a precondition.

### Step 1, first cut — LANDED 2026-09-05: `core/engine/src/edit-buffer.ts`

The three per-node booleans that recorded what the adapter had touched — `dirty`, `propsDirty`,
`structureDirty` — are gone from `ISymbioteNode` and are now three `Set`s in the buffer, read
through `hasPendingWork` / `hasPendingProps` / `hasPendingStructure` and consumed through
`clearPending*`. Mechanics are IDENTICAL by construction (same bubble, same early exit, same
mark-before-mutate ordering), so this cut cannot be the cause of a behaviour change, and the whole
suite reads the same: 5574 passed, plus the one pre-existing `core/css-parser` golden-corpus
snapshot.

**State the boundary honestly, because the name promises more than the cut delivers.** The buffer
today holds WHICH nodes were touched, not WHAT the edit was. That is enough to take the record off
the node — every field removed from `ISymbioteNode` is a step toward "an address plus whatever the
framework already allocated" — and it is NOT yet the thing a native drain consumes. Carrying the
edits themselves (key, value, index) is the second cut, and only then is there something to hand
to `cloneMultiple`.

**The one cost the swap introduces, and it has no equivalent in the flag era.** A boolean died with
its node; a `Set` PINS it. Without a sweep, `Clear` on a thousand ten-node rows leaks ten thousand
nodes for the life of the process, with byte-identical Fabric output and every test green — a leak
no oracle in this repo can see. So every path that cuts a parent link nominates
(`nominateDroppedEdits`) and `sweepDroppedEdits` decides at commit which nominees really left.
Nominate-then-decide rather than drop-at-removal, for the reason `sweepDetachedBehaviors` next door
already has: an adapter spells a MOVE as remove-then-reinsert, and dropping a moved child's entries
loses a prop written in the same tick.

Anyone building the second cut inherits that shape: **a buffer keyed on node identity owes a
liveness answer, and removal is not one.**

### Step 2's shape is DECIDED BY `fabricProps`, and it rules out the obvious design

The natural reading of "the buffer carries the edits" is: `setProp` writes `{key, value}` into the
buffer, the commit hands that straight to `cloneNodeWithNewProps`, and `diffProps` disappears —
one of the two diffs §7 names as ours and removable. **That design is wrong, and the reason is
structural rather than a detail to work around.**

`fabricProps` (`core/engine/src/fabric-props.ts`) is a WHOLE-BAG fold, three times over, and each
fold can rewrite keys nobody wrote:

```
foldAriaProps        aria-checked  ->  accessibilityState      gated on node.hasAriaAlias
node.payloadFold     readOnly      ->  editable                lowered primitives only
foldTextInputValue   value         ->  text                    the two TextInput views
addStyle             class         ->  ~20 flattened style keys
```

So a raw edit does not map to a payload edit, and the mapping is not even per-key: writing one
`class` moves twenty payload keys, and writing `aria-checked` moves a key the adapter never named.

**And folding at WRITE time is not merely more expensive, it is incorrect.** The aria fold's own
comment says why: `aria-checked` has to be folded against a sibling `accessibilityState`, and
`routeProp` sees one key at a time. `fabricProps` is deliberately "THE ONE POINT WHERE THE WHOLE
BAG IS KNOWN ON EVERY PATH". A fold needs the settled bag, so it cannot move to the mutation site,
and therefore the buffer cannot hold Fabric-level pairs.

What survives: **the buffer holds the adapter's OPERATIONS in order** — create / insert / remove /
setProp / setText, at the level the adapter issued them — and the fold runs at DRAIN time, where
the bag is settled, exactly as it does today. That is still the shape a native drain consumes,
because the payload crossing to C++ has to be folded first either way and the fold is our policy
layer, not something C++ can take over.

Two consequences worth stating before anyone plans the work:

- **`diffProps` does NOT go away with step 2.** It is downstream of the fold, so knowing which raw
  keys changed does not tell you which payload keys changed. Removing it is a separate question and
  may have no answer.
- **Step 2 is ONE change, not a series of safe slices.** An ordered op log that nothing drains is a
  reachable symbol with no consumer — the shape `.claude/rules/adapter-parity-audit.md` records as
  the quietest failure here — and the log only pays off when the drain REPLACES the walk. Splitting
  it into "add the log now, consume it later" would be exactly the dishonest split
  `<adapters_reach_full_feature_parity>` forbids elsewhere. Land it whole or not at all.

### The SCOPE was measured — and the FIRST measurement was read wrong. Both versions are here

**CORRECTED 2026-09-05, within the hour, after the project owner pushed back on the conclusion.**
The first probe counted `node.children` / `node.parent` only, and the result was reported as
"`commitTargeted` is ALREADY skeleton-free". That is false, and the way it is false is the useful
part.

**The engine holds the structure TWICE.** `IMirror` (node.ts) carries
`children: readonly ISymbioteNode[]` and `parent: ISymbioteNode | undefined` — a SECOND child order
and parent link, over the same node objects:

```
DESIRED     node.children   / node.parent      written by adapters, the retained tree
COMMITTED   record.children / record.parent    what Fabric holds, the mirror
```

`commitTargeted` does not read the first because it navigates the second (`ancestor = record.parent`,
`for (const child of record.children)`). Reading one copy instead of the other is not reading
neither. Counting both:

```
                                  d.kids   d.par   c.kids   c.par     total
create 800 nodes                    2402       1        0       0      2403
general commit, ONE prop changed     209       0        3     204       416
TARGETED commit                        1       0        2       5         8
```

And even the 8 UNDERSTATES it: the probe counts structure FIELDS, while `commitTargeted`'s
sibling-handle loop reaches each sibling through `committedOf(child)` — a `committed` read, which
the probe deliberately does not count. So that path still does O(siblings) work per branch node; it
is simply not visible in this column.

Two things survive from the first reading and one does not:

- **STILL TRUE: every `node.children` read in the general commit is inside `renderableChildren`** —
  the anchor flatten plus the empty-raw-text drop, and nothing else. The single `node.parent` read
  is `sweepDroppedEdits`'s own liveness test.
- **STILL TRUE: the targeted path is far cheaper in structure reads, 8 against 416**, because it
  goes change -> root instead of root -> change.
- **FALSE: that it needs no tree.** It navigates the mirror, and it only manages that by REFUSING
  everything structural — any pending structural change bails it to the general path. A fast lane
  that declines the hard cases is not a drain that works.

**So "only a buffer remains" means removing BOTH copies, and they have different answers.** The
desired copy goes when the buffer carries the ops (insert/remove with position), because the drain
can then derive the new order from the committed copy plus the ops. The committed copy goes only
when something else can answer "what are this node's children right now" — which is `getChildNodes`
in §1a, i.e. exactly what the JSI navigation probe measures. Removing one without the other just
moves the reading.

**So step 2 is: make the renderable child list incremental rather than re-derived.** The mirror
already stores it (`record.children`), so a node whose renderable list cannot have changed can reuse
that record and never touch `node.children`. What makes that sound is the ATTRIBUTION being right —
`hasPendingStructure(node)` must be true whenever this node's renderable list could differ. Two
holes in that were found the same day and both are now fixed and guarded:

```
an edit under an ANCHOR      recorded on the anchor, not on the renderable ancestor
an empty-string setText      changes the parent's renderable list with no structural op at all
```

Both were live bugs before they were design constraints, and the second was found by the fuzzer one
value after its generator learned to write `''`. Do not attempt the incremental reuse until any
third member of that family is ruled out — the failure mode is a node that silently stops reaching
Fabric, which is the same class the whole buffer is careful about.

Do NOT re-derive this coupling by reading the code. Re-run the accessor probe: it is ~120 lines,
takes a minute, and it is the difference between "the commit walks the tree" (the intuition, and
wrong in the way that matters) and "the commit reads one function's worth of the tree".

### What else LANDED 2026-09-05, and which of it is a TOOL rather than a cut

The buffer above (`42415a3`) is one of FIVE code changes that shipped this day, and only two of
the five move the design. Of the other three, two are fixes to live bugs and one is an instrument
— separating them is the point of this entry, because a session that reads "five commits toward
the drain" will over-count how far the work got. The two fixes were also found by DIFFERENT means,
which is worth keeping straight: the loop found one of them, and the other came from asking a
design question of the code.

```
42415a3  the edit buffer                  a CUT      step 1 of §9's order
c293e48  the verification loop            a TOOL     four oracles, shrinking, calibrated
9d0ead2  anchor structural attribution    a FIX      found by DESIGN — no test had the shape
cc059c0  a skipped node's stale family    a FIX      found by the LOOP; a native abort on device
7b43358  core/engine/src/tree.ts          a CUT      the one seam the desired copy leaves through
```

**The loop (`core/engine/src/__tests__/commit-fuzz.test.ts`) is the reason any of this is
checkable.** It generates a random mutation PROGRAM — the program is data, so a failure prints as
a reproducible list of steps rather than as a stack — runs it against the engine, and after every
commit asks four questions: the committed structure equals what the desired tree says it should
be; every committed node's props equal what `fabricProps` would build for it right now; the fake
Fabric's own tree agrees with the mirror; and nothing reachable is still pending. It then SHRINKS
a failing program to the shortest prefix that still fails.

Two properties of it are worth copying rather than re-deriving, and both cost a round to get right:

- **The oracles were CALIBRATED, not assumed.** Four real engine injuries were introduced one at a
  time and the loop was asked which oracle spoke and after how many steps. That is what caught
  oracle 1 reading `testID` — it subsumed oracle 2, so a missed PROP mark reported as a STRUCTURE
  failure and oracle 2 could never fire. Oracle 1 is now structural only (view name and child
  order), and the same injury reports ORACLE 2. Two oracles where the earlier one subsumes the
  later leave the later one permanently unwitnessed, which is
  `.claude/rules/verify-the-deciding-side.md`'s earlier-guard trap inside a harness.
- **ORACLE 3 is witnessed by NO injury reachable from these programs, and the file says so.** It
  compares the fake slot's tree against the mirror, and every injury that can desynchronise them
  also trips an earlier oracle. It stays because it is the only oracle that would catch the mirror
  and the slot disagreeing, which is exactly what a native drain could introduce — but it is
  recorded as unwitnessed rather than counted as coverage.

**Both bugs were pre-existing and both were silent, and only the second came from the loop.**

The anchor one was found by asking which node CARRIES the record while designing the drain. No
test had the shape, and the loop cannot reach it either: the general commit re-derives
`renderableChildren` on every node it visits, so it repairs itself and never notices.
`markStructureDirty(anchor)` named a node the commit never looks at, while the node whose
committed child list actually went stale looked untouched — and only `commitTargeted`, which
deliberately does NOT re-derive, committed a tree the retained tree does not describe. Its
reachable spelling is `setNativeProps` / `setNodePressed`, i.e. a native-event write, after which
nothing else asks for a commit — so the append was not one commit late but indefinitely late.
**A self-repairing walk hides an attribution bug from every oracle that reads the walk's output**,
which is precisely why the drain has to be designed against attribution rather than validated
against the walk.

The second one the loop did find. A node that became SKIPPED at commit — a raw text whose content
went to `''`, the one thing `isSkippedAtCommit` drops entirely — kept its committed record, so on
RETURNING it took the update path and re-appended a handle whose Fabric family belongs to its
parent's PREVIOUS Fabric node. On a device that is not a stale pixel: Fabric enforces in C++ that a
family cannot be reparented, so it is a native abort. It surfaced one value after the generator
learned to write `''` one time in five, which is the whole argument for a generator that emits
boring values as well as interesting ones — every value before that was `t0`..`t999`, and the
hazard was simply not expressible.

**And the throw that carried it came from the fake slot's own `assertSameFamily`, not from any
oracle.** A harness that treats only a failed expectation as a violation never SHRINKS such a
program, so the red arrives as a stack instead of as a ten-step reproduction. The runner now
counts a throw as a violation for exactly that reason — worth copying into any differential loop:
the invariants your subject asserts for itself are oracles too, and they are the ones a shrinker
is most likely to be denied.

**`tree.ts` (`7b43358`) is a SEAM, not a replacement**, and its own header states that at length.
Every read and write of the desired structure now goes through seven functions in one file; the
backing is still the two fields, and nothing observable changed. It exists because the swap is
otherwise a 57-site edit with no guard — and `tests/engine-structure-seam.test.ts` holds it with a
type-aware audit rather than a grep, because `.parent` is also a field on the animated graph and
on an event, and a textual census over `core/engine/src` reports 93 matches where the truth is 25.
That test carries a sentinel arm (the seam's own sites must always be found, so a moved barrel
cannot produce a green run that examined nothing) and a synthetic break-test (a probe file is
written, the audit is required to flag it, the file is removed).

**The committed copy is deliberately NOT guarded yet**, and the first version of that test's header
gave the wrong reason — it named `NativeDOM` as the replacement, which §1a and §6a rule out
between them. The route §7b chose is our own module's `pendingRoot_`, a different mechanism. It
gets its own seam and its own guard when that cut happens; asserting it now would be a rule nobody
can satisfy and would hide which half is actually done.

## 8. THE WORK ORDER — read this before starting anything in this file

Status as of 2026-09-05, end of session. Every item names what it depends on, and the ones marked
LANDED name the commit so a reader can diff rather than re-derive.

```
                                                              status      blocked on
0   price a JSI navigation round-trip on a device             NOT RUN     a device
1   the seam: structure reachable through ONE module          LANDED      —
2   the edit buffer holds WHICH nodes were touched            LANDED      —
3   a verification loop that can catch a silent regression    LANDED      —
4   the buffer holds the OPERATIONS, and the commit drains    NEXT        nothing
    them instead of walking
5   anchors stop being NODES and become POSITIONS             AFTER 4     4, and only if the
                                                                          native branch is taken
6   setNativeProps arm for prop-only rows                     OPEN        —
7   the address rides on the framework's own object           AFTER 4     —
8   our own JSI host object (pendingRoot_ + cloneMultiple)    OPEN        0, and a measured
                                                                          residual after 4-7
```

**Why 4 is next and not 5 or 8.** It is the only item BOTH design branches require, for two
different reasons (§7b): under a JS skeleton the drain needs the ops to derive the new child
order; under a C++ `pendingRoot_` the memo must be REBASED by re-applying the command log inside
a retried commit lambda, so a buffer holding only "which nodes were touched" has nothing to
re-apply. It also needs no device and no native code, which no other remaining item can say.

**Why 0 is listed first and is still not the next thing to do.** It decides between the two
branches (§7b), and until it is run neither branch may be built as though chosen. But item 4 is
common to both, so the queue is not blocked on a device — start there and run 0 whenever a device
is free. `NativeDOM` already ships `getChildNodes` / `getParentNode` (§1a), so the crossing can be
measured from JS with zero native work; `examples/react/screens/JsiNavigationCostScreen.tsx`
exists for exactly this.

**Item 5 is NOT a prerequisite for 4, and reading it as one costs the wrong week.** An anchor has
no Fabric node, so no native structure can hold one — that makes it a blocker for the NATIVE
branch (item 8) and irrelevant to a JS drain, which handles anchors exactly as the walk does
today. The temptation is to fix the visible obstacle first; the obstacle is only visible from a
branch nobody has chosen yet.

**Item 6 is independent of all of it** and is the cheapest measurable win on the board — the host
API is already there, it needs no native work, and it is read against the clone-bubble on
`Select` / `Partial update`. It is also the item whose hazard this skill understated until
2026-09-05: honour §4's stickiness rule and gate it PER KEY, because our clone payload is a
minimal DIFF and an unchanged declarative value is therefore absent from it, so the sticky patch
wins by default rather than losing a fight. A key ever written through `setNativeProps` must
ALWAYS be written that way. Read §4's two-merge table before implementing — the one-line version
("setNativeProps wins forever") predicts the wrong behaviour for a key the diff does name.

**Neither this nor anything else in the 2026-09-05 re-verification moved an item or a
dependency.** Three C++ facts changed (§1's name list and the read that does exist, §3's caller
census, §4's merge semantics) and one grep result was wrong (§7b); item 0 gained a second
candidate read, `findShadowNodeByTag_DEPRECATED`, which is strictly worse than `getChildNodes`
(O(n) per call over every surface) and so does not need pricing of its own.

### What 4 actually is, so it is not mis-scoped

The buffer records the adapter's OPERATIONS in order — create / insert / remove / setProp /
setText, at the level the adapter issued them — and the drain runs the fold at DRAIN time. Not
Fabric-level key/value pairs: §9's "Step 2's shape" proves that design wrong from `fabricProps`,
which is a whole-bag fold three times over and cannot move to the mutation site.

It is ONE change, not a series of slices. An ordered op log that nothing drains is a reachable
symbol with no consumer, and the log only pays off when the drain REPLACES the walk. The safe way
to land it whole is a second implementation beside `reconcile`, verified differentially against it
over the fuzzer's programs, and switched over only when the Fabric call sequences agree.

`diffProps` does NOT go away with it — that diff is downstream of the fold, so knowing which raw
keys changed does not tell you which payload keys changed. Removing it is a separate question and
may have no answer.

### The two attribution holes that must stay closed, and how to look for a third

Item 4's correctness rests on one property: `hasPendingStructure(node)` is true whenever that
node's RENDERABLE child list could differ from its committed snapshot. Two ways that was false
were found and fixed on 2026-09-05, both live bugs before they were design constraints:

```
an edit under an ANCHOR      recorded on the anchor, not on the renderable ancestor above it
an empty-string setText      flips whether a raw text is SKIPPED, so it changes the parent's
                             renderable list with no structural op anywhere
```

The shape they share is that a node's presence in its parent's renderable list is decided by
something other than a structural op on that parent. Before building the incremental derivation,
enumerate what else `isSkippedAtCommit` and `renderableChildren` consult — a third member of that
family produces a node that silently stops reaching Fabric, which is the class the whole buffer is
careful about.
