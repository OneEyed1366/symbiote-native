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

- **It reads the CURRENT REVISION.** The spec text: _"If a version of the given shadow node is
  present in the current revision of an active shadow tree, it returns an array of instance
  handles of its children. Otherwise, it returns an empty array."_ A node created but not
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

### 4a. `cloneMultiple` is NOT a commit path for a renderer, and the reason is one line in `ShadowNodeFamily`

Proposed 2026-09-08 as a way to drop the engine's dirty flags: the change set is already the op
buffer, so hand the changed FAMILIES to `ShadowNode::cloneMultiple` and let Fabric clone only the
paths. The API is real, public and reachable — `getShadowTreeRegistry()` (`UIManager.h:211`, already
proven on device by `probeUIManager`), `ShadowTree::commit(transaction, options)`
(`ShadowTree.h:120`), and the transaction's retry makes the rebase free because the change set is
DATA rather than a pre-built root. All of that checked out. It still does not work, twice over.

**It cannot change a child list.** `cloneMultipleRecursive` (`ShadowNode.cpp:414-438`) replaces
children by INDEX — `(*newChildren)[i] = cloneMultipleRecursive(*children[i], …)` — so length and
order survive untouched. That half is escapable: the callback returns any node it likes, and
`fragment.children` (descendants already updated in place) is a good base to rebuild from, keyed by
tag.

**What is not escapable is that it locates the changed nodes through the FAMILY graph, and that
graph is immutable:**

```cpp
void ShadowNodeFamily::setParent(const Shared& parent) {          // ShadowNodeFamily.cpp:36
  react_native_assert(parent_.lock() == nullptr || parent_.lock() == parent);
  if (hasParent_) return;        // once, forever
  parent_ = parent;
  hasParent_ = true;
}
```

`cloneMultiple` walks `family->parent_` upward to build `childrenCount`, and **returns `nullptr` when
the walk never reaches the root** (`:475-477`). So in a tree that has ever MOVED a node, the family
graph diverges from the real tree and a later edit under the moved subtree produces a silently
failed commit rather than a wrong one.

That is also why RN does not render with it: React's Fabric path is `completeRoot` →
`UIManager::completeSurface`, and `cloneMultiple` exists for `setNativeProps` and state updates —
i.e. for a tree whose STRUCTURE somebody else owns. A renderer's case is exactly the inverse.

**And it explains an assertion that reads as a fake-host quirk.** `assertSameFamily` in
`core/test-utils/src/fake-fabric.ts` refuses to append a node to a second parent; that is not the
fake being strict, it is the fake mirroring `setParent`. A moved node needs a FRESH FAMILY — a new
`createNode`, not a clone of the committed handle — which is what `commit.ts:939`'s
`committed.parent === renderableParent` re-check has always been buying.

So the standing shape holds: `completeSurface` with a full child set, plus our own record of what
changed. The dirty pair is not a diff being re-derived — the ops write it, O(1) each — and it is
what makes an update cost the changed paths instead of the whole tree.

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

and `uimanager/UIManagerCommitHook.h` says in its own header comment: _"Implementing a commit
hook allows to observe and alter Shadow Tree commits."_ `shadowTreeWillCommit` hands you the old
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
and the header says what "pending" means here: _"transactions waiting to be consumed and mounted
on the host platform"_. So the one thing in the mounting layer that carries the word is
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

### 0' — step 0 is SUPERSEDED, 2026-09-07: the COUNT was measured with no device, and it kills the per-call form of design (2)

Step 0 asks what ONE crossing costs, to decide between the branches. The cheaper question is how
MANY crossings each branch implies, and it needs no device — a counter on `childrenOf` / `parentOf`
in `tree.ts` answers it. The answer removes the choice rather than informing it.

**Two censuses, and the first one is the trap.** Driving the mutation API directly measures the
ENGINE's own navigation and reports almost none:

```
                  mutate                    commit
create 1000 rows  children=0 parent=3001    children=3005 parent=1
select 1 of 1000  children=0 parent=2       children=6    parent=1
swap 2            children=0 parent=3       children=5    parent=1
```

`parent` is exactly 1 per structural op — all of it `detach`, which exists ONLY to synthesise the
remove op, and which a declarative applier (`insert child into parent before X`, native resolving
the old parent) deletes outright. `children` on the commit side is the JS walk, and the walk is
what design (2) moves native. So on this reading the engine needs ONE batched crossing per commit
and nothing per mutation, and the design looks free.

**It is not, because a real framework navigates and the engine census cannot see it.** Vue's
`RendererOptions.parentNode` / `nextSibling`, Solid's `getFirstChild` / `getNextSibling`, Angular's
`Renderer2.nextSibling` are CONTRACT — the framework calls them during its own patch, and no
amount of engine work removes them. Measured through the real `mount()` harness, 500 rows, two
runs byte-identical:

```
vue create 500 rows   children=1505  parent=1501    createNode=1502
vue swap 2 rows       children=1005  parent=3008    <- ~4 000 reads for an O(1) logical change
vue remove 1 row      children=1006  parent=3002
vue clear 500 rows    children=1502  parent=1004
```

At §7b's own ~1.5 us constant that is **~6 ms of pure crossings to swap two rows**, against 8.7 ms
for the whole operation today. `remove 1` the same. So **navigation may not be a per-call JSI
crossing**, and step 0 would only have told us how bad it is.

### Step 0 IS MEASURED NOW — 2026-09-07, iPhone 17 simulator, iOS 26.5

`examples/react`'s `JsiNavigationCostScreen` finally ran, on the build that brought up our own native
module. It had never been executed before and crashed on its first press — the fix is a type trap of
RN's own (see below), not a measurement problem.

```
                        10 children   100 children   1000 children
JS field read (floor)      0.052 us      0.052 us        0.053 us
getParentNode              2.326 us      2.319 us        2.238 us     <- the per-query constant
getChildNodes              4.019 us     12.737 us      104.350 us     <- tracks the list length
```

**`getParentNode` is FLAT in child count** — 4% across two orders of magnitude — so it really is the
per-crossing constant and not a search. Three things follow, and the first invalidates a number this
file has quoted twice:

- **The constant is 2.3 us, not the ~1.5 us §7b assumed.** Every piece of arithmetic derived from
  1.5 us understates by ~1.5x. The two-row swap census (~4 000 reads) is therefore **~9.2 ms of pure
  crossings**, against 8.7 ms for the entire operation today — i.e. a per-call navigation design
  costs MORE than the whole operation currently does. Design (1) is not merely unattractive, it is
  arithmetically excluded.
- **A JSI call is ~44x a JS field read** (2.326 / 0.052). That ratio is what the whole
  `MutableBuffer` direction rests on, and it is now measured rather than assumed.
- **`getChildNodes` is ~3.1 us fixed plus ~0.1 us per child**, so a 1 000-child list costs 104 us to
  materialise once. Solid's `cleanChildren` on 1 000 children — the case §7b priced at ~1.5 ms — is
  **2.24 ms**.

**Caveat, and it is the one this repo has a standing rule about: this was a DEV build.** Debug
inflates JS-bound work 3-9x. That cuts in a known direction here — the FLOOR is JS and is therefore
the inflated arm, while `getParentNode` is mostly native work behind one crossing. So the true
floor is lower, the true ratio is HIGHER than 44x, and every conclusion above is conservative. Re-run
on Release before quoting the floor itself; the JSI constants and the flatness need no re-run to
carry their verdict.

### And the other half is measured too, same sitting — the answer is 0.99x

Whether Hermes reads a `MutableBuffer`-backed `ArrayBuffer` as a direct load or inserts a per-access
check was the last open question in this design, and it is the one that decides whether ANY of the
44x survives. Measured with our own module's `allocInt32Array`, on the same screen and the same
build:

```
plain Int32Array         0.0305 us/read
MutableBuffer-backed     0.0303 us/read      ratio 0.99x
guard 22196916, EQUAL on both arms
```

**Hermes adds nothing.** Native memory reads exactly as fast as an ordinary typed array, so the node
table can move behind a native store with no read-side cost at all.

Read against the crossing constant from the arms above, a native-memory read is **~76x cheaper than
a JSI call** (2.292 / 0.0303) — better than the 44x computed off the other floor, and the difference
is the floor's own shape rather than a discrepancy: the navigation arms' floor reads a property off a
boxed object and branches on it, while this one sums an `Int32Array` element. Quote 76x for the
store, 44x for the object floor, and neither as "the" ratio.

Three things make the number trustworthy rather than a plausible-looking one, and they are the shape
any repeat should keep: the fold sums the VALUES (a null-check fold lets an optimiser keep the branch
and drop the load), the index walks a stride of 37 so it is neither one cache line nor a sequential
scan, and both arrays hold identical contents so the two arms MUST fold to the same guard — a
mismatch means they read different data and the card does not render at all. The native arm runs
first, so first-touch page faults cannot land entirely on the plain one.

**Consequence for 8b', and it is not "do it now".** The swap is behaviour-neutral by construction and
buys NOTHING on its own — JS still writes the table, so native memory only starts paying when the
native applier writes it in 8c-1. Its real value is proving that neutrality on a device before the
applier lands. And it carries a layout decision that must not be made twice: three separate
`allocInt32Array` calls give native three unrelated regions to find, whereas 8c-1 wants ONE table it
owns. So `allocInt32Array` is a stepping stone that proved the mechanism, not the final API — decide
the layout inside 8c-1, or 8b' gets rewritten.

**What survives, and it is the design that finally has no JS tree in it.** The two things JS does
are asymmetric and must not share a mechanism:

```
WRITES   the op log, shipped once per commit          ONE crossing, batched — already built (4b)
READS    parent / firstChild / nextSibling            a TYPED-ARRAY VIEW over native memory,
                                                      not a function call
```

A `jsi::ArrayBuffer` over a C++-owned `MutableBuffer` gives JS an `Int32Array` whose reads are
direct memory loads — no crossing per element, the cost of an array index. The node table
(`parent[] / firstChild[] / nextSibling[] / generation[]`, keyed by a dense node id) lives in
native beside `pendingRoot_`; JS holds a view, not a copy, and holds no child arrays, no records,
no back-edge. That satisfies "no tree in JS" literally rather than by relocation — the structure
exists once, natively — and it is the only shape the 4 000-read census permits.

Three things this makes concrete, in order:

- **`detach` must go before anything else.** It is the whole of the engine's per-mutation
  navigation, it is removable with no native work at all (make the insert op declarative and let
  the applier resolve the old parent), and every later step is cheaper without it.
- **The node id becomes the address.** `ISymbioteNode` today carries `committed` (a JS record);
  under this design it carries an integer index into the table. That is item 7's "the address
  rides on the framework's own object", now with a concrete address.
- **`IContribution` still cannot move**, for the reason §7b already gives: an anchor has no Fabric
  node, so it has no row in a table of shadow nodes. It is per-node bookkeeping, not a tree, and
  it stays.

**The one thing step 0 would still be worth measuring on a device**, once there is one: whether a
`MutableBuffer`-backed `ArrayBuffer` read from Hermes is genuinely a direct load, or whether Hermes
inserts a bounds/detach check per access that makes it closer to a call. That is a much narrower
question than the original, and it gates the READ half only.

**Method note, because it decided the answer.** The engine-side census is the one anybody would
write, it is cheap, and it reports the design as free. It is wrong for the same reason
`test-harness-false-greens` §11 records: it constructs the subject differently from production —
no framework in the loop, so the caller that actually navigates never runs. **A census of a seam
must be driven by the layer that calls it**, and here the two answers differ by three orders of
magnitude.

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

Status as of 2026-09-06. Every item names what it depends on, and the ones marked LANDED name the
commit so a reader can diff rather than re-derive.

```
                                                              status      blocked on
0   price a JSI navigation round-trip on a device             MEASURED    2026-09-07: 2.3 us flat,
                                                                          ~44x a JS field read. The
                                                                          COUNT had already settled
                                                                          the design (0'); the number
                                                                          says it is worse than the
                                                                          estimate, not better
1   the seam: structure reachable through ONE module          LANDED      —
2   the edit buffer holds WHICH nodes were touched            LANDED      —
3   a verification loop that can catch a silent regression    LANDED      —
4a  the commit consumes the record for its child list         LANDED      —
4b  the ordered op log, replayed by the commit                LANDED      —
4c  node.children DELETED; node.parent STAYS                 DONE        4c-1/2/3 landed; 4c-4
                                                                          measured and REJECTED —
                                                                          it lands at item 8
5   anchors stop being NODES and become POSITIONS             LANDED      —
6   setNativeProps arm for prop-only rows                     OPEN        —
7   the address rides on the framework's own object           AFTER 4     8a (the id IS the address)
8   our own JSI host object — SPLIT, see 0' and below         DECIDED     nothing; 8a starts now
8a  detach stops reading the parent (declarative insert op)   FOLDED      into 8c — both stated
                                                                          reasons for doing it
                                                                          first are dead, see below
8b  the node table: parent as a typed array, JS-owned         LANDED      node.parent DELETED;
                                                                          reclamation solved by a
                                                                          generational slotmap +
                                                                          amortised WeakRef sweep
8c-0 the native module EXISTS and installs a host object     LANDED      device-confirmed 2026-09-07
8b' point the same arrays at a MutableBuffer                  FOLD INTO   8c-1 — the mechanism is
                                                              8c-1        proven (0.99x), but the
                                                                          swap buys nothing until
                                                                          native WRITES the table,
                                                                          and doing it early fixes a
                                                                          layout 8c-1 must choose
8c-1a our C++ reaches the real UIManager                      LANDED      probeUIManager() = 1,
                                                                          device-confirmed 2026-09-07
8c-1b the Android registration shim, same C++ unchanged      BUILT       .so in the APK, all 4
                                                                          assumptions held; device
8c-1 the applier: createNode/cloneNode/appendChild +          LANDED      see SINCE, below
     completeSurface from C++. NOT pendingRoot_, NOT a
     commit hook, NOT cloneMultiple — see below
```

### SINCE — the table above is dated 2026-09-06 and two of its rows have been overtaken

Read this before acting on a row. Verified against the tree on 2026-09-10, `tsc --build` clean and
660 files / 5 551 tests green.

**8c-1 LANDED, and not as an applier.** `SymbioteApplier.{h,cpp}` is deleted; `SymbioteTree.cpp`
takes the ADAPTER's alphabet instead of replaying Fabric ops, so the 2 041-line JS walk did not move
to C++ — it stopped existing. `commit.ts`, `tree.ts`, `edit-buffer.ts`, `batching-slot.ts`,
`node-table.ts` and `tags.ts` are gone from `core/engine/src`; the one JS tree left is
`core/test-utils/src/tree-applier.ts`, which is the headless ORACLE and ships in nobody's app.

**8b's reclamation answer is superseded.** The row credits a generational slotmap plus a WeakRef
sweep; both are gone with `node-table.ts`. The shipped answer is that `Tree` holds NOTHING — a node
is `NativeState` on the JS placeholder the adapter already holds, so Hermes' collector owns the
lifetime and a parent keeps its children alive. The `weak_ptr` table that stood between them died on
device (`node 1 is gone`) and was reverted in `18b89237`: Fabric's state reconciliation clones the
path to the root, so any `ScrollView` re-creates a root JS legitimately still names.

**Items 6 and 7 are BOTH dead, checked 2026-09-10 — the work order has no open engineering row.**
Both died of the same cause: each was justified against `commit.ts`, and their reasons went with it.

**Item 6 would make things WORSE, not merely buy nothing.** Its case was "a path clone inside C++,
no per-level JSI crossing", read against the clone-bubble in the JS walk. The bubble is `materialize`
now — already C++, already one `completeSurface` per commit. `setNativeProps_DEPRECATED` commits per
CALL (§4's own quote: `shadowTree.commit(…)` inside it), so a `Partial update` touching 100 rows
would pay 100 `ShadowTree::commit`s, each with layout and a mount pass, against our one. And there is
nothing left to win on the row it targeted: `Select` reads NODES 1046 against React's own renderer's
1006 on the identical tree.

**Item 7 is satisfied, and its original mechanism is gone twice over.** As written it was "the node
id becomes the address — an integer index into the table", and that table left with `node-table.ts`;
the address is `NativeState` on the handle now. Re-derived as "drop the extra per-node object", it
was measured across all five adapters rather than assumed — the assumption was wrong:

```
react    host-config.ts:158     createInstance returns the engine node    ONE object
vue      renderer/index.ts:91   createElement returns it                  ONE
solid    renderer.ts:213        createElement returns it                  ONE
angular  renderer/index.ts:11   imports the engine's createElement        ONE
svelte   dom-shim/element.ts:149  ShimElement + createEngineNode()        TWO
```

Four already hold exactly one object — the engine node IS what the framework holds. Svelte's second
object is the DOM shim, which exists because its compiler emits DOM calls; removing it removes the
adapter. Svelte is also already 0.80x stock on Create, so the prize is small where it exists at all.

**So the next item cannot be chosen from this file — only from a measurement.** `Create` is
284.4 ms wall against 65.7 ms of Fabric, so ~219 ms is pass 1, and every adapter column in root
CLAUDE.md predates the native tree. Re-level, measure, then pick.

**8c was one item and it is two, because 8b' was blocked on the wrong half.** "Needs the native
module to own the store" is a dependency on the module EXISTING, not on `pendingRoot_` — and the two
are days apart in risk. Split 2026-09-07.

The first half is bring-up and it is deliberately behaviour-free: an ObjC TurboModule in
`core/engine/ios/`, whose creation installs `global.__symbioteEngineNative` carrying one function that
returns an `Int32Array` over a native `MutableBuffer`. It changes nothing about how the engine runs.
What it buys is that every unknown between here and a native applier gets answered ONE at a time —
autolinking, the podspec, codegen, the JSI install point, `MutableBuffer` lifetime, and §0's one
surviving device question (whether Hermes reads such a buffer as a load or as a call).

**It lives in `core/engine`, not in a package of its own, and that is a packaging decision worth
keeping.** `@symbiote-native/engine` is already a direct dependency of all six examples and already
peers `react-native`, so RN's autolinking finds the podspec with no entry in anybody's Podfile and no
new release. A separate package would have cost a version, a line in six manifests, and a row in three
parity audits (`adapter-parity-audit.md`) — to ship a module whose only consumer is the engine.

**The registration seam is `RCTTurboModuleWithJSIBindings`**
(`ReactCommon/react/nativemodule/core/platform/ios/ReactCommon/`), whose
`installJSIBindingsWithRuntime:callInvoker:` `RCTTurboModuleManager` calls when it CREATES a module —
RN's own `AnimatedModule` reaches the runtime the same way. So there is no `install()` for JS to call
and deliberately so: an explicit install has an ordering requirement nothing enforces, while this hook
cannot be skipped by anyone who reaches the module at all. JS resolves the module for its SIDE EFFECT
and then reads the global; a reader looking for the payload in the codegen spec will not find it, and
the spec's comment says so.

### How big 8c-1's win is, sized from the measured constant — do this before starting it

Derived 2026-09-07, once step 0 gave a real per-crossing number. A 1 000-row create asks Fabric for
10 000 `createNode` + 9 000 `appendChild` = 19 009 crossings; at 2.29 us that is **~43.5 ms of pure
crossings**. Checked against a window that was actually measured, on the older nine-node row (17 009
calls): 39.0 ms predicted against a 49.8-50.9 ms measured reconcile window.

```
reconcile window        ~50 ms
  crossings             ~39 ms    78%
  our JS in the walk    ~11 ms    22%
```

**The window is almost entirely crossings, not our code.** That is the number behind this file's
standing advice to stop optimising the walk, and it is what makes 8c-1 worth its size: 19 000
crossings collapse into one.

Now the honest sizing, which is smaller than the ratios above invite:

```
Create 1 000, total      ~200 ms   (solid 195.7 / vue 228.7, 10-node row)
  the reconcile window     ~50 ms
  8c-1 removes           ~39-43 ms  ->  about 20% of Create
  pass 1                  ~150 ms   the framework building its own tree — untouched
```

**~20% on the create-shaped rows, not an order of magnitude.** 76x is the ratio of a memory read to
a JSI call; it is not an application speedup, and conflating the two is easy and expensive.

Two corrections to that estimate, pointing opposite ways:

- 2.29 us was measured on a call taking ONE opaque reference and returning one. `createNode` marshals
  a whole props object (44 001 keys per 1 000 rows), so its crossing is heavier and 43.5 ms is a
  LOWER bound. In our favour.
- **The op log has to cross too** — but this is an optimisation, NOT a gate, and the first version of
  this bullet said the opposite ("the win exists only if the log crosses as MEMORY"). Corrected the
  same day from data already on the screen above: `getChildNodes` materialises 1 000 handles for
  108.9 us against a ~3.1 us fixed part, i.e. **~0.106 us per marshalled object**. So 19 000 ops as a
  plain JS array cost ~2-4 ms against the 43.5 ms the per-call route spends — an array-of-objects log
  already captures ~90% of the win, and crossing it as memory buys the remaining ~2-4 ms, about 2% of
  a Create.

  Use a flat `Int32Array` anyway: with every node carrying a `tid` since 8b, an op is
  `[parentTid, childTid, beforeTid, flags]` and that is no harder to write than an array of objects,
  strictly cheaper, and the same shape the node table already proved. Just do not sequence the work
  as though it were the deciding factor — it is worth 2%, and the 20% is in removing the 19 000
  calls.

  **Method note, because the error is the reusable part:** a plausible cost was promoted to a gate
  without arithmetic, and the arithmetic that refuted it needed no new measurement — the number was
  already on the same screen. Before letting a suspected cost decide a sequencing question, bound it
  from data in hand.

### Two 8c-1 unknowns answered from SOURCE, no device run — 2026-09-07

Both were about to be turned into device measurements. Reading `.vendors/react-native` settled them
in minutes, and the pattern is worth the entry: a question about what RN's own code does is a
READING question, and only a question about what a machine does is a measurement.

**1. The props do not spoil the sizing.** The worry: `createNode` marshals a whole props object
(44 001 keys per 1 000 rows), so batching the CALLS might remove only `appendChild` and halve the
~43.5 ms estimate. It does not. `UIManagerBinding.cpp:243` builds `RawProps(runtime, arguments[3])`,
and that constructor (`core/RawProps.cpp:20`) is LAZY — it sets `Mode::JSI` and retains the
`jsi::Value`, converting nothing. The parse happens later, in `RawPropsParser`, and it happens
whether the call came from JS one node at a time or from a batched native applier. So:

```
createNode today   host-function dispatch + 5 arg conversions + valueFromShadowNode   REMOVABLE
                   RawProps retain + props parse + ShadowNode alloc                   NOT — same either way
```

2.29 us was measured on a call with one argument and one returned object, which is exactly the
removable part. The estimate stands unchanged, and `valueFromShadowNode` — a JSI object allocated per
created node, purely so JS can hold a handle it will not need once the tid IS the handle — is
additional removable cost the estimate does not even count.

**2. The install ORDERING is safe by construction, and 8c-0 got it right by luck.**
`UIManagerBinding::getBinding(runtime)` reads `global.nativeFabricUIManager` and returns `nullptr`
when it is absent (`UIManagerBinding.cpp`), so a module created before Fabric installs its binding
cannot reach the UIManager at all. Our module is created from `getSlot()` (fabric.ts), which reads
that same global and THROWS when it is missing — so by the time `installJSIBindingsWithRuntime:`
runs, the binding is guaranteed present. The seam was chosen in 8c-0 for a different reason (a hook
nobody can skip); this is a second property it happens to have, and `probeUIManager` returning -1 vs
0 is what CONFIRMS it rather than assuming it.

**3. The pod already depends on everything needed.** `install_modules_dependencies` →
`NewArchitectureHelper.install_modules_dependencies` adds `React-Fabric` (whole pod, all subspecs —
`uimanager` among them, `React-Fabric.podspec:215`), plus `React-graphics`, `React-utils`,
`React-rendererdebug`, `Yoga`, `ReactCommon/turbomodule/core`. So `#include
<react/renderer/uimanager/UIManagerBinding.h>` needs no podspec change. Checked before writing the
include, which is why the bring-up step is one build rather than three.

### 8c-1a — the reach probe, DEVICE-CONFIRMED 2026-09-07, and why it is NOT a commit hook

**Result: `probeUIManager() = 1`**, iPhone 17 / iOS 26.5. The strongest of the three possible
answers — not merely non-negative but ONE, so our C++ reached a UIManager that is holding a live
shadow tree, i.e. the one the app renders through, rather than an empty one built for something
else. Everything downstream of this is now unblocked:

```
compiles against react/renderer/uimanager headers from a third-party pod    yes
links against the prebuilt React.xcframework                                yes
resolves the UIManager from a plain JSI runtime, no app-side wiring         yes
the ordering (module created after Fabric installs its binding)             confirmed, not assumed
```

The same run re-read the store arm at **1.00x** (0.0301 us both arms, guard equal), which is the
second sitting to reproduce 8b''s 0.99x. That number now has two independent measurements.

`probeUIManager()` in `SymbioteEngineBindings.cpp` resolves
`UIManagerBinding::getBinding(runtime)->getUIManager()` and returns the shadow-tree count off
`getShadowTreeRegistry().enumerate`. Behaviour-free, and it retires the whole reach chain in ONE
device run: compiles against ReactCommon's renderer, links against the prebuilt
`React.xcframework`, and resolves the UIManager from a third-party TurboModule's runtime with no
app-side wiring. Surfaced in `examples/react`'s `JsiNavigationCostScreen`, above the `NativeDOM`
guard so it still reports on a host where RN's DOM module is absent.

**An INERT commit hook was the obvious first step and was rejected.** It would have tripped
`applier-is-not-forked.test.ts`, whose marker is `registerCommitHook`, and the tempting repair —
narrow the marker to `cloneMultiple` — is wrong twice over: RN's own reference hook applies changes
with plain `ShadowNode::clone` (`FantomForcedCloneCommitHook.cpp`), so `cloneMultiple` is not the
only spelling of an applier; and weakening a guard to admit one step is the exact arc the guard
exists to stop. An inert hook also proves nothing a `getUIManager()` call does not. The marker
stands; -1 vs 0 is what the hook question actually needed answered, and this gets it without one.

### 8c-1b — the Android registration shim, BUILT 2026-09-07

`./gradlew :app:assembleDebug` in `examples/react/android` succeeded, and all four of the recorded
assumptions held on the first run — the codegen'd `NativeSymbioteEngineSpec.java` generated with the
shape the Kotlin expected, `external override` bound, the version-less `react-android` coordinate
resolved, and autolinking found the folder.

**But BUILD SUCCESSFUL is not the evidence, and the log actively misleads here.** Gradle printed
tasks for five other `symbiote-native_*` modules and NONE for `symbiote-native_engine` — no
`configureCMakeDebug`, no `buildCMakeDebug`, no Kotlin task — because a warning-free task prints
nothing. A module that autolinking never found produces the identical silence and the identical
BUILD SUCCESSFUL. The artefacts are what settle it:

```
libsymbiote_engine.so   present for armeabi-v7a, arm64-v8a, x86, x86_64, in merged_native_libs
autolinking.json:37     "packageImportPath": "import dev.symbiotenative.engine.SymbioteEnginePackage;"
codegen                 android/build/generated/source/codegen/java/…/NativeSymbioteEngineSpec.java
```

So the C++ compiled against ReactAndroid's `reactnative` prefab, linked, and reached the APK. Device
confirmation is still owed — the signal is `native-engine: native store available, ABI 1` under
`DEBUG=1`, where Android currently logs the `no native store on this platform` branch.

**Generalises past this build: for a NEW gradle module, absence of its tasks in the log is not
evidence either way.** Check for the `.so` and the autolinking entry, never the exit code.

Same shape the split predicted: `core/engine/cpp/` is compiled UNCHANGED by
`core/engine/android/CMakeLists.txt` (globbed, never copied), and only the registration is new.

**The seam is `TurboModuleWithJSIBindings`, and it is a true analogue of iOS's, verified in RN's own
source rather than taken on trust.** `TurboModuleManager.cpp:205-215` checks
`isInstanceOf(JTurboModuleWithJSIBindings)` immediately after creating the Java module and calls
`installer->cthis()->installBindings(runtime, jsCallInvoker_)`. So on BOTH platforms the hook fires
on module CREATION and there is no `install()` for JS to call — the property 8c-0 chose the iOS seam
for holds on Android for free. RN's own `SampleTurboModule.kt:271` is the precedent to copy, down to
the `@DoNotStrip external override fun getBindingsInstaller(): BindingsInstallerHolder`.

Four things worth not re-deriving:

```
prefab targets        ReactAndroid publishes exactly THREE — jsi, reactnative, hermestooling
                      (build.gradle.kts, the prefab{} block). There is NO react_renderer_uimanager
                      target: since 0.76 the renderer is merged into libreactnative.so and its
                      headers are folded into the `reactnative` prefab. Link `reactnative`.
BindingsInstaller     newObjectCxxArgs takes (Runtime&, const shared_ptr<CallInvoker>&). The
                      one-argument overload is [[deprecated]], which under -Werror is a build failure.
BaseReactPackage +    load-bearing, not style. TurboModuleManager::getLegacyModule never consults
isTurboModule         TurboModuleWithJSIBindings, so a plain ReactPackage would create the module,
                      work, and install NOTHING, silently.
react-native.config   .cjs, not .js — core/engine is "type": "module", so module.exports in a .js
                      throws. The `ios` key is OMITTED rather than null: undefined keeps podspec
                      auto-detection, null would disable it.
```

**Four assumptions remain and only a Gradle run settles them**, listed because they are the risk: the
codegen'd `NativeSymbioteEngineSpec`'s exact Java shape (it does not exist on disk until codegen
runs), `external` on `getVersion` overriding a codegen'd abstract method, the version-less
`com.facebook.react:react-android` coordinate, and the autolinked Gradle project name.

Build: `pnpm run registry:sync` then `cd examples/react/android && ./gradlew :app:assembleDebug`.
Success signal on device: `DEBUG=1` and `native-engine: native store available, ABI 1` — Android
currently logs the `no native store on this platform` branch.

### The applier needs NO commit hook and NO `pendingRoot_` — the work-order row overstates it

Derived from source 2026-09-07, straight after 8c-1a confirmed we hold a real `UIManager&`. The row
reads `8c-1 pendingRoot_ + cloneMultiple + the commit hook`, which is a design for answering
navigation off an UNCOMMITTED tree — the thing item 0' already killed. What 8c-1 actually needs is
smaller, and every piece of it is a public method on the `UIManager` we can now reach:

```
UIManager.h:149  createNode(tag, componentName, surfaceId, RawProps, instanceHandle)
UIManager.h:156  cloneNode(shadowNode, children, RawProps)
UIManager.h:161  appendChild(parent, child)
UIManager.h:165  completeSurface(surfaceId, rootChildren, CommitOptions)
```

Those are the SAME four our JS slot calls through JSI today — `UIManagerBinding.cpp`'s `completeRoot`
is a one-line forward to `completeSurface`. So the applier is a transliteration, not a redesign:

```
JS hands over once per commit   a flat op log + a jsi::Array of props, indexed by the log
C++ replays it                  createNode / cloneNode / appendChild, holding tid -> shared_ptr
C++ publishes                   completeSurface(surfaceId, rootChildren, options), once
```

**And the retry is already harmless for this shape.** `UIManager::completeSurface` calls
`shadowTree.commit(lambda, options)` with a lambda that IGNORES `oldRootShadowNode` and replaces the
root's children wholesale — so whatever root a retry hands it, the answer is the same. That is why no
rebase is needed and why `pendingRoot_` was only ever a requirement of the design that kept an
uncommitted tree in C++.

**`cloneMultiple` is for the UPDATE-shaped rows and cannot serve the create-shaped ones.** Its
contract (`ShadowNode.h:104`) is to replace the node of each named FAMILY — it mutates an existing
tree and creates nothing. On a 1 000-row Create there are no families to update and 10 000 nodes to
make, so `createNode` in a loop is the mechanism there. Both remove the same JSI crossing; they are
different tools for different rows, and conflating them made the item look bigger than it is.

### The applier is a BATCHING SLOT, not a native replay — decided 2026-09-07

The work order describes design B: hand native the child-op log and let it derive the tree. There is
a design A that captures the same win for a fraction of the risk, and the fact that decides between
them is one grep: **nothing in the engine ever looks INSIDE an `IFabricNode`.** Every use in
`commit.ts` is store-it-and-pass-it-back; the type is an opaque brand and it is honoured.

```
B  native gets the CHILD-EDIT log and derives the tree
   -> replayChildOps must be rewritten in C++: three refusals, anchors, hoisting, skipped
      children — the logic that cost 30 red tests to get right — with no test coverage
   -> ~5 600 headless tests stop covering what actually runs

A  native gets a log of FABRIC CALLS. The slot stops calling and starts buffering; a handle
   becomes an integer; completeRoot flushes the whole batch in ONE crossing
   -> not one line of engine logic changes
   -> installFabric() still works, so the headless suite keeps its meaning
```

**Both remove the same 19 009 crossings, because the win is the per-call JSI overhead and not where
the logic lives.** B additionally moves the ~11 ms of JS inside the reconcile window — about 5 ms
more of a ~200 ms Create — and pays for it by reimplementing the engine's subtlest function in a
language with none of its tests. A dominates on every axis; this is a finding, not a preference.

So the shape is a second `IFabricSlot` implementation:

```
direct     today's: every method is one JSI call
batching   createNode / clone* / appendChild* append a record and return an integer handle;
           completeRoot flushes once; dispatchCommand / measure / sendAccessibilityEvent resolve
           their integer through the table native keeps ACROSS commits (they are called from app
           code at arbitrary times, not inside a commit)
```

**Consequence for exit criteria 2 and 4: they were about design B and they dissolve.**
`replayChildOps` and `replayDesired` are not a second applier under A — they compute child lists,
which native never does. The coverage question dissolves with them: the slot is still a slot, so
`installFabric()` keeps working and Fantom becomes a nice-to-have rather than the replacement for a
lost suite.

### 8c-1c — the batching slot and the wire format, LANDED 2026-09-07 (JS half), DELETED 2026-09-08

> **All five files below are GONE.** They batched the per-call JSI crossings of a JS walk that
> derived Fabric operations — and that walk no longer exists, so there is nothing left to batch: the
> adapter records its own mutations and the whole commit crosses as one buffer. Deleted together with
> `setBatchedCommits` and the example's `BATCHED_COMMITS_VIA` arm switch. Everything below is the
> record of the path, kept because its FINDINGS survive the code (the opcode-contract hazard, the
> object-file verification method, the arity collision) — none of the file paths do.

```
core/engine/src/batching-slot.ts        records instead of calling; two replays (objects, flat)
core/engine/src/slot-differential.test  4 programs x 3 arms — direct, records, encoded
core/engine/src/batch-encoding.test     pins the opcode numbers the C++ switches on
core/engine/cpp/SymbioteApplier.{h,cpp} the C++ half — COMPILES AND LINKS (iOS, 2026-09-07)
```

**The C++ built on the first attempt**, against `UIManager::createNode` / `cloneNode` / `appendChild`
/ `completeSurface`, `RawProps(runtime, value)`, `InstanceHandle(runtime, value, tag)` and a
zero-copy `Int32Array` read through `ArrayBuffer::data` + `byteOffset`. Every signature had been
checked in `.vendors/react-native` before writing, which is why: the rungs are read the source, read
the compiled text, execute — and for a pure API-shape question the first rung is the cheap and
correct one.

Verified by the OBJECT FILE, not by the build's exit code — `SymbioteApplier.o` under
`Pods.build/…/symbiote-engine.build/Objects-normal/arm64/`. A source that never reached the compile
produces the identical `Successfully built the app`, the same way Gradle prints nothing for a module
autolinking never found (8c-1b).

### 8c-1d — WIRED, 2026-09-07. `via: 'native'` exists and nothing on a device has run it yet

```
SymbioteApplier          + the imperative five, resolving by ID through the same table
batching-slot.ts         + via: 'native' — encodeBatch, then ONE applyOps; no handle comes back
fabric.ts                + the loud refusal: `native` with no module THROWS, never degrades
examples/react/index.js  + BATCHED_COMMITS_VIA, the arm switch, `undefined` by default
```

The five are here rather than left on `nativeFabricUIManager` for the reason the design forced: a
handle never returns to JS, so RN's own copies have nothing to unwrap. Each is its
`UIManagerBinding::get` branch with `Bridging<shared_ptr<ShadowNode>>::fromJs(…)` replaced by a table
lookup, callback protocol included — six zeroes, four zeroes, `onFail`.

**`react/renderer/dom/` is NOT in ReactAndroid's prefab headers**, so `#include <…/dom/DOM.h>` would
break the Android build of the same file iOS compiles fine. Guarded with `__has_include` rather than
`__ANDROID__`: the fact is about the TOOLCHAIN'S HEADERS, and the guard self-heals the day upstream
exports the folder instead of leaving a platform check nobody revisits. The two calls that go
straight to `UIManager` need none of it and build everywhere.

**Criterion 3 is closed, and it is a throw.** `getSlot()` refuses `via: 'native'` when
`nativeEngine()` is undefined, naming `pod install`. A fallback there would run the JS replay and
report it as the native arm — a measurement that lies, which `native-engine.ts`'s header already
argues is worse than a crash. Break-tested: disabling the throw fails the case.

**The differential gained a fourth arm and it is what the tree assertions could not say.** Disabling
the native branch leaves all four tree arms GREEN — the batch replays in JS and builds the identical
tree — and moves only `applyOps === 1`. So the count assertion, not the tree, is what witnesses the
item.

**And that arm exposed a harness defect the other three had been tolerating.** `rootContainers` in
`commit.ts` is module-level and keyed by rootTag, so it survives `installFabric()` and carried the
previous arm's handles into the next arm's mirror. `records` and `encoded` absorb that (a resolved
box needs no creating record); `native` throws on a clone source no batch created. `disposeRoot`
per arm — the arms now differ in the slot and in nothing else, which is what the file claimed all
along.

**The one thing shipped knowingly broken: `nodes_` is STRONG and never pruned.** Every node the app
has ever mounted stays alive, ~19 000 entries per create-shaped commit. It leaks because the JS side
cannot say when a handle DIES — `IBox` lives in a `WeakMap` and Hermes has no `FinalizationRegistry`
to report the collection. Two ways out, preferred first: hand ids back on a free list from a
`WeakRef` sweep, or return real handles carrying the `shared_ptr` as `NativeState` (one array per
batch, still one crossing) and let JS GC own the lifetime — which is exactly how
`nativeFabricUIManager` never had this problem. Fine for a measurement, NOT for shipping.

**The FABRIC CALLS table reads ZERO under `'native'`, and that is correct.** The counter wraps the JS
global; C++ talks to the UIManager directly. The workload is identical by construction — same engine
walk, same record set — and the differential asserts the counts equal across every replay. To read
counts on a device, take the arm as `'encoded'`: same bytes, replayed in JS.

**Two bugs the differential caught that no single-commit test could.**

A handle outlives its batch. `commit.ts:1287` keeps it in the mirror and clones from it on a LATER
commit, so the first design's batch-local indices were stale the moment the next batch began: every
one-commit program passed and every multi-commit one threw. The fix is that the placeholder carries
its own resolution — a box in a `WeakMap`, which also makes it GC-clean where a persistent index
table would pin every handle ever minted. Same shape as the tid-log liveness finding earlier the
same day: **the engine's cross-commit retention is the thing a fresh design keeps getting wrong.**

And the break-test that stayed GREEN was the more useful one. Breaking `NO_CHILDREN` (-1 -> 0)
reddened nothing, because the fake host supports child lists so `commit.ts` never passes `undefined`
— the engine reaches that form only against a host WITHOUT child-list support. The arm that will not
move is the finding: the differential was underpowered there, not the distinction unnecessary
(`cloneNodeWithNewChildren(node)` keeps children, `(node, [])` clears them). Closed with a direct
encoder test, which reddens correctly.

**The opcode numbers are the one contract no compiler sees.** They are spelled in
`batching-slot.ts` and again in `SymbioteApplier.cpp`, and a renumbering on one side commits a
different tree with no headless symptom at all. `batch-encoding.test.ts` pins them as LITERALS —
deriving them from the JS constants would make the test agree with any renumbering and guard
nothing. Same treatment `SUPPORTED_NATIVE_VERSION` gets, for the same reason.

Android's `CMakeLists.txt` now GLOBS `../cpp/*.cpp` rather than listing: the podspec globs, so a
listed set would mean a new shared source compiles on one platform and not the other — a link error
on Android for a symbol iOS resolves fine, arriving whenever somebody forgets the line.

### That kills the applier guard's marker, and the guard has to be fixed BEFORE the applier lands

`applier-is-not-forked.test.ts` keys on `registerCommitHook` appearing in our native sources. Under
the design above the applier never calls it — so the guard would sit green while a native applier
landed beside the JS one, which is precisely the failure it was written to make impossible. A proxy
marker that under-fires is worse than none, because the file's own header reads as coverage.

Marker widened to `registerCommitHook` OR `completeSurface`. The second is the unmistakable one: it
is what PUBLISHES a tree, no other call does, and a native applier that never publishes is not an
applier. Note this is not the narrowing that was rejected in 8c-1a — that one would have admitted a
step the guard should stop; this one closes a hole the guard did not know it had.

### 8c-1 has NO independently-landable sub-piece — three candidates tried, 2026-09-07

Worth recording because "find a small first step" is the correct instinct and it fails here for a
structural reason rather than for lack of looking. All three obvious decompositions were taken far
enough to see why:

```
8b'   the table into native memory   buys nothing until native WRITES it; JS still writes it today
8a    a declarative insert op        needs a GLOBAL applier that sees every parent's log at once,
                                     which is the native one (this file's own §8a already says so)
the   a flat Int32Array op log       both replays splice ARRAYS OF NODES and match by identity
log                                  (`out.indexOf(op.child)`), so a tid log in JS only ADDS a
                                     tid -> node resolution. Its value is being the wire format.
```

Every one pays off only alongside the native applier, which is exactly why the item was made one
slice. So the sequencing question has no clever answer: 8c-1 is a multi-day monolith or it is not
started.

**And a liveness hazard the flat log introduces — MEASURED 2026-09-07, and the standing guess was
WRONG.** Today `IEditOp.child` is a STRONG reference and it is what keeps a child alive until the log
is drained. A `tid` log drops that: `nodesByTid` is a `WeakRef` array, the parent edge is an
`Int32Array` slot, and all three edit-buffer collections are weakly keyed BY the node — so
`IEditOp.child` is the engine's only strong hold on a node Fabric has never seen.

This section used to say "probably safe in practice (a removed committed child is held by its
parent's mirror, an inserted one by the framework)". The second clause is false.
`core/engine/src/__tests__/edit-op-holders.test.ts` builds all seven scenarios through the real
mutation API, strips `op.child`, forces GC and reads a `WeakRef`:

```
remove of a COMMITTED child                      P.committed.desired          safe
move P->Q, and remove+reinsert in one cycle      P.committed.desired          safe
insert of a new, never-committed node            NOTHING but the op log       LOST
never-committed child removed again this cycle   NOTHING but the op log       LOST
child of a never-committed node (bottom-up)      NOTHING but the op log       LOST
```

**So a tid log loses exactly the class of node every first mount is made of** — which is the
create-shaped rows 8c-1 exists to speed up. Not a corner case.

**The killer fact is that Fabric holds `instanceHandle` WEAKLY** — `const jsi::WeakObject
weakInstanceHandle_` in `ReactCommon/react/renderer/core/InstanceHandle.h`. The native side is never
a holder, so "the framework holds it" was never true of anything below the adapter's own tree.

**The fix is in the LOG, not in the table — and the first repair written here was worse than the
bug.** That one said: `nodesByTid` holds a strong ref while a node has no `committed` mirror and
demotes it at first commit. It leaks. A node created and DISCARDED without ever committing never
reaches a demotion, and nothing else would clear the slot — which is exactly the set the
nominate-then-sweep pass used to reclaim before it was deleted as wrong (`edit-buffer.ts`'s header).
Frameworks produce that shape routinely: Solid spells a move as remove-then-reinsert, and a subtree
can be built and dropped before a flush.

It is also the wrong layer. **The log already has precisely the right lifetime**: `pendingStructure`
is a `WeakMap` keyed by the PARENT, so a log dies with its parent and is cleared at the parent's
commit. So the flat log does not have to be pure tids:

```
Int32Array   [parentTid, childTid, beforeTid, flags]   crosses to native as memory
side array   [childNode, …]                            liveness only; never marshalled
```

Zero change to `nodesByTid`, no leak, and the crossing cost is untouched — native reads only the
`Int32Array`. It is what `IEditOp.child` does today, relocated beside the structural record rather
than deleted.

**And dropping `instanceHandle` is safe, which is the question that produced this correction.**
`IMirror.children` and `IMirror.desired` are plain `readonly ISymbioteNode[]` (`node.ts:334`,
`:344`), so every committed node is reachable from the surface root down the mirror chain.
`nodesByTid` was never the holder for a mounted node and does not need to become one; Fabric's weak
`instanceHandle` costs nothing because the node is alive through its parent's mirror.

**Two method notes, both worth more than the finding.** The test's first version forgot to strip
`op.child` and reported all seven rows SAFE — of course it did, that field is the reference under
question; the fix was to make the break arm part of the file's contract. And the fake Fabric slot
held `instanceHandle` STRONGLY, which pinned every node and would have reported "safe" for a second,
unrelated reason. **A liveness test on a fake host measures the fake's retention policy until
somebody checks it against the real one.**

### 8c-1 is ONE slice, and the JS applier's deletion is inside it — decided 2026-09-07

On the user's direction, after they read the first version of this section and asked the question it
had glossed: _"так что, у нас параллельно будет и JS сторона, и нативная?"_ The honest answer is that
two different things were being called "the native path" and only one of them is a fork:

```
                 JS                  native              is it two implementations?
the STORE (8b')  new Int32Array(n)   MutableBuffer       NO — node-table.ts is byte-identical,
                                                         one implementation with two allocators
the APPLIER      replayChildOps      cloneMultiple in    YES — two spellings of one fold
                 + replayDesired     a commit hook
```

So the store's fallback may stand indefinitely and the applier's may not. A JS applier kept "for
now" beside a native one is two implementations of a fold whose divergence is a differently-ordered
child list on one platform — nothing in this repo would catch it and no screen would announce it.
Every rule file here records the same arc: prose said temporary, the temporary thing outlived the
session that wrote it, the next reader inherited it as the design.

**Guarded structurally, not by this paragraph.**
`core/engine/src/applier-is-not-forked.test.ts` fails the moment `registerCommitHook` appears in our
own native sources while `replayChildOps` / `replayDesired` still exist. Native roots are DERIVED by
listing (`cpp`, `ios`, `android`), so Android's shim joins the audit the day its folder exists. Three
arms verified: clean green, a planted call red naming the file, a planted COMMENT green — the first
run went red against this project's own prose, which is the substring-over-source hazard this repo
already documents.

**Therefore Android is in the slice, and the arithmetic says that is affordable.** The applier is
SHARED C++: RN's own twin, `AnimatedModule`, is a pure C++ TurboModule under
`ReactCommon/react/renderer/animated/` with no platform directory, and all eight `registerCommitHook`
call sites in RN are shared code. Only the REGISTRATION shim is per-platform — an ObjC class on iOS,
a JNI one on Android — because RN registers its own C++ modules from inside its TurboModule manager
and 0.86's codegen generator has no third-party `cxxModules` path. Hence `core/engine/cpp/` (shared)
beside `core/engine/ios/` (shim), from 8c-0 onward, so Android's slice starts by adding a file rather
than by extracting one.

**The expensive part, named because it is easy to discover too late:** ~5 600 headless tests drive
the JS applier against a fake Fabric slot. Faking `new Int32Array` is free; faking C++ tree cloning
is not, so those tests stop covering what actually runs the day the applier moves.

#### What replaces that coverage — researched 2026-09-07

**RN's own answer exists and cannot be used — but NOT for the reason first recorded here.** `Fantom`
is a Jest runner that executes RN's C++ — shadow nodes, layout, events, scheduling, C++ state
updates — which is exactly the shape needed.

The first version of this paragraph said it "ships only inside RN's monorepo (not in
`.vendors/react-native`, which is `packages/react-native` alone)". **That is false and was never
checked**: the vendored tree is the WHOLE monorepo (`packages/`, `private/`, `scripts/`, `jest/`),
and Fantom sits at `.vendors/react-native/private/react-native-fantom/`. The unpublished half is
true and is settled by its own manifest — `"private": true`, `"version": "0.0.0"` — so no registry
probe is needed to know it will never be on npm. Availability was the stated blocker and it is not
one.

**The real blocker is that the tester has no extension point for a third-party C++ TurboModule**, and
it is structural rather than a policy:

```
fantom_tester                     a fixed C++ executable, built by gradle :private:…:buildFantomTester
  module provider                 a hardcoded if/else over FOUR RN modules; the OSS provider
                                  (tester/src/platform/oss/TesterTurboModuleProvider.cpp) returns
                                  nullptr for every name
  CMakeLists                      file(GLOB SOURCES tester/src/*.cpp …) — its own sources only
```

Getting `core/engine/cpp` into that binary means editing `TesterAppDelegate.cpp` and
`tester/CMakeLists.txt`, which is patching RN's native sources — `<native_core_is_untouched>`. So
**Fantom can test everything except the one thing 8c-1 changes.** The docs' "tests must live in
`packages/react-native`" is a maintenance-scope statement and is NOT mechanically enforced (the
runner only resolves paths relative to the monorepo); it is not what stops us.

**What it IS good for, and this is worth having independently of 8c-1.** The tester runs the real
bridgeless runtime, so `global.nativeFabricUIManager` inside it is the genuine binding over a real
shadow tree. That is a replacement for `installFabric()` — the fake slot ~5 600 headless tests run
against — for the JS half of the engine: it would check that the tree our commit DESCRIBES is the
tree Fabric actually builds, which no test in this repo does today.

#### Investigated properly 2026-09-07 — VERDICT: viable, with ZERO edits under `.vendors/`

The "tests must live in `packages/react-native`" scoping is enforced twice and only one is hard.

```
soft   config/jest.config.js:18-24   rootDir + roots fixed to the RN monorepo. We write our own config.
HARD   runner/global-setup/
       globalSetup.js:46-48          the Metro config path is HARDCODED, no env override, and
                                     config/metro.config.js:31 sets projectRoot to the RN root with
                                     watchFolders: [] -> our files are outside Metro's file map
```

**The escape hatch is that jest names `globalSetup`, so it is OURS to write.** A copy of
`globalSetup.js:45-90` that pushes our repo root into `metroConfig.watchFolders` before
`Metro.runServer` resolves it — and this works only because `.vendors/react-native` is a
SUBDIRECTORY of our repo, which is the ordinary monorepo shape Metro is built for. It also needs
`resolver.extraNodeModules` for `@symbiote-native/engine` (pnpm links per-consumer, so there is no
`node_modules/@symbiote-native` at our root) pointed at `core/engine/build/index.js`, not `src/*.ts`.

**The trap that would otherwise cost a day: `Root.render()` is React-only.** `src/index.js:90-104`
hardcodes `ReactFabric.render(...)`. But `createRoot()` only calls `NativeFantom.startSurface`, and
`getRenderedOutput()` only needs the surfaceId — so the framework-agnostic path is
`createRoot()` -> `getRootTag()` -> drive our engine's commit inside `Fantom.runTask()` ->
`getRenderedOutput()`. React never enters. Everything our slot calls is present in the tester
(`createNode`, both clone forms, `appendChild`, `createChildSet`, `appendChildToSet`, `completeRoot`,
`registerEventHandler`, plus `measure`/`dispatchCommand`/`setNativeProps`).

**And the oracle is the right one.** `getRenderedOutput()` serialises the C++ `StubViewTree` — the
MOUNTED tree, not a call log — as `{type, props, children}` with `.toJSX()`; RN's own
`SafeAreaView-itest.js:31-37` is the shape to copy. `takeMountingManagerLogs()` gives the mutation
sequence as a second, independent oracle.

**Build prerequisites, measured on this machine:**

```
.vendors/react-native has NO node_modules at all          yarn install (workspaces) — do this FIRST
CMake 3.30.5 from the Android SDK, NOT auto-downloaded    have 3.22.1 / 4.1.2; sdkmanager or override
Hermes built FROM SOURCE with debugger                    absent — the long pole, tens of minutes
OpenSSL 3, JDK 17, ANDROID_HOME                           present
folly / gflags / nlohmann_json / boost                    downloaded at build time, needs network
```

**Sequence it so the cheap arm proves the idea first.** `yarn install` plus a config check answers
whether the `watchFolders` widening resolves `@symbiote-native/engine` — that is the only genuinely
uncertain part, and it costs an install. The multi-hour native build is worth starting only after
that returns yes. Command:

```
cd .vendors/react-native && yarn install
./gradlew :private:react-native-fantom:buildFantomTester      # LONG — builds Hermes from source
cd <repo> && yarn jest -c tests/fantom/jest.config.js
```

**The method note, because it repeats:** the blocker on record was "unavailable", and it was wrong
in a way that made the option look closed without anyone opening the directory. A dependency
declared unreachable is worth one `ls` before it is written down — and when the real blocker is
found, it is usually narrower and tells you what the tool CAN still do.

### CORRECTION 2026-09-08 — the vendored tree is RN `main`, so a tester built here tests the WRONG C++

Everything above is about whether Fantom CAN be stood up. It can, at the cost recorded. What nobody
checked is what it would then be measuring:

```
.vendors/react-native   packages/react-native   1000.0.0   (main, HEAD 370606dc5b6)
this repo consumes      react-native            0.86.0
```

`fantom_tester` is built from the vendored monorepo, so it links **main's** ReactCommon. Our pod
links 0.86.0's. A green Fantom run would therefore be evidence about a Fabric we do not ship — and
the whole reason to want Fantom is verifying OUR C++ against the C++ that reaches a device. That is
not a cost to weigh against the build time; it is a different question being answered.

Two smaller corrections to the record while it is being read:

- **"viable with ZERO edits under `.vendors/`" is false**, and was quoted twice on 2026-09-08 as a
  reason not to keep a second implementation. The monorepo has no `node_modules` at all, so step one
  is a `yarn install` that writes into `.vendors/`. The section above already says this; the
  one-line summary elsewhere did not, and the summary is what got read.
- **`@react-native/fantom` is not on npm** — a 404, not a permissions error, and `react-native-fantom`
  is too. It exists only as vendored source marked `private: true`, version `0.0.0`. So there is no
  route that skips the build.

And one claim NOT to inherit from the same investigation: that `config/metro.config.js`'s hardcoded
`projectRoot` is unescapable. It is unescapable _by env, config merge or CLI_, which is what was
measured — and the `globalSetup` route this section describes was never reached, the run having
stopped earlier on a missing `yarn`. Two different mechanisms; the second is still untested.

**So the oracle for a native commit path has to be built here.** A TypeScript reference
implementation, which the existing ~5 600 tests already exercise against `installFabric()`, plus a
gtest target linking ReactCommon from the INSTALLED `react-native` — the version we actually ship.

**The good news is that the ORACLES already survive the move, by an earlier decision rather than by
luck.** `core/engine/src/__tests__/commit-fuzz.test.ts` asserts against INDEPENDENT reimplementations
of the flattening rules (oracle 1) and of the desired-children model (oracle 6) — not against
`replayChildOps`. So the assertions are implementation-agnostic by construction and would hold over a
native applier unchanged. What does not survive is `installFabric()`, the fake slot that lets any of
it run in Node.

```
A  Fantom                            VENDORED and buildable, but its tester cannot host our C++
                                     module without patching RN. Covers the JS half only — which is
                                     a real gap worth closing, just not THIS one.
B  gtest on our own C++              fast; needs a host ReactCommon build; blind to the JS<->native seam
C  the fuzzer, on device             oracles already portable, and every example already carries a JSI
                                     recorder (`fabric-call-counter.ts`) that can feed oracle 3.
                                     BUT: zero `*.detox.ts` in the repo and no device job in any
                                     workflow — this is infrastructure built from nothing.
D  the JS applier as a TEST-ONLY     nearly free (the code exists, it moves), and it is what §"What 4
   oracle in core/test-utils         actually is" already prescribed: a second implementation verified
                                     differentially over the fuzzer's programs, switched over only when
                                     the Fabric call sequences agree.
```

Direction: **D during the transition, C after.** D is not a loophole in exit criterion 2, and the line
is reachability rather than existence — `components` is a runtime dependency every adapter gets
without asking, `test-utils` is a devDependency someone installs on purpose. A fallback runs on a
user's device; an oracle cannot. `applier-is-not-forked.test.ts` therefore scans `core/engine/src`
only, and its header says so explicitly so the allowance is not read as an oversight.

**Mechanics unblocked by the same research:** the applier reaches the hook from a plain JSI runtime
with no app-side wiring — `UIManagerBinding::getBinding(runtime)->getUIManager()`, then
`registerCommitHook`. Read out of RN's own
`ReactCommon/react/nativemodule/fantomtestspecificmethods/NativeFantomTestSpecificMethods.cpp`, which
is the only file in RN that registers a commit hook FOR A TEST and is worth reading before writing
ours.

Exit criteria for the slice, all four or it does not land:

```
1  the native applier applies the op log through cloneMultiple in a commit hook, iOS + Android
2  replayChildOps and replayDesired are DELETED, and the guard test proves it
3  a missing or ABI-mismatched module FAILS LOUD — a silent fallback here is a measurement that
   lies, not resilience. `native-engine.ts`'s graceful `undefined` is correct only while nothing
   depends on it.
4  the coverage the headless suite loses is replaced by something named
```

**The JS half must stay absent-tolerant, permanently, and that is not defensiveness.** `undefined` is
the majority case — ~1 000 headless engine tests, all of Android, any app between `npm install` and
`pod install`, and any app whose pod is older than its JS. `nativeEngine()` returns the bindings or
`undefined`, refuses an ABI it does not know rather than reading someone else's memory layout, and
nothing in the engine may require it. The native store is an ACCELERATOR behind the seam the JS store
already sits behind — which is exactly what 8b bought by landing the table in JS first.

**Item 8 is DECIDED and no longer blocked on item 0** (2026-09-07, on the user's direction that no
JS tree may remain and that native work is acceptable). 0' explains why the naive form of it —
answering navigation with a JSI call per read — is dead on arrival at ~4 000 reads per two-row swap,
and why the surviving form splits writes from reads: the op log crosses once per commit, the
structure is READ through a typed-array view over the native node table rather than called for.

**8a was scoped as "NEXT, pure JS, no device" and BOTH halves of that were wrong** (corrected
2026-09-07, same day it was written). It is folded into 8c.

The plan was: make the insert op declarative, let the applier resolve the child's old parent, and
`detach`'s `parentOf` — 3 001 reads on a 1 000-row create, the entire `mutate parent=` column in
0''s first census — stops existing.

```
"pure JS"                 false. childrenOf(P) replays P's OWN log onto P's OWN base, so a
                          per-parent applier cannot learn that X was stolen by Q. A declarative
                          insert needs a GLOBAL applier that sees every parent's log at once,
                          which is the native one — 8c, not before it.
"it removes a crossing"   false by the time it was written. Under 0's surviving design parentOf
                          is an ARRAY INDEX, not a JSI call, so there is no crossing to remove.
                          The rationale died in the same turn that chose the design.
```

**What survives is a different reason, and it is 8c's own: rebase safety.** `ShadowTree::commit` is
a retried transaction (§5), so the op log is re-applied against a root that may have moved under it.
An op carrying a pre-resolved old parent is a fact about the tree at RECORD time and can be stale on
replay; a declarative one re-resolves against whatever root the retry hands it. That makes it a
requirement of the native applier, not a preliminary to it.

The pre-remove still has to leave both replays (`replayDesired` in tree.ts, `replayChildOps` in
commit.ts) in the same change — an op that no longer carries it must not be replayed as though it
did. That part of the plan was right; only its placement and its justification were not.

**Why 4 is next and not 5 or 8.** It is the only item BOTH design branches require, for two
different reasons (§7b): under a JS skeleton the drain needs the ops to derive the new child
order; under a C++ `pendingRoot_` the memo must be REBASED by re-applying the command log inside
a retried commit lambda, so a buffer holding only "which nodes were touched" has nothing to
re-apply. It also needs no device and no native code, which no other remaining item can say.

**Read "What 4 actually is" BELOW before planning it — the item was re-scoped 2026-09-05 after its
first cut landed and the cost model was measured, and two of its stated premises were wrong about
where the desired tree is read.** Its 4a is done; 4b is the piece both branches require and is what
NEXT means here.

**Why 0 is listed first and is still not the next thing to do.** It decides between the two
branches (§7b), and until it is run neither branch may be built as though chosen. But item 4 is
common to both, so the queue is not blocked on a device — start there and run 0 whenever a device
is free. `NativeDOM` already ships `getChildNodes` / `getParentNode` (§1a), so the crossing can be
measured from JS with zero native work; `examples/react/screens/JsiNavigationCostScreen.tsx`
exists for exactly this.

**Item 5 was NOT a prerequisite for 4, and was the thing 4b was waiting on — CORRECTED 2026-09-05
by measuring it, and CLOSED 2026-09-06 when item 5 landed; the reasoning error below is why it is
kept.** The paragraph here read: an anchor has no Fabric node, so no native
structure can hold one, which makes it a blocker for the NATIVE branch and irrelevant to a JS
drain, "which handles anchors exactly as the walk does today". Every clause is still true and the
conclusion no longer follows. "Handles them as the walk does" is exactly the cost: 4b's replay
refuses on any parent holding a skipped child, so an adapter that mounts an anchor per composed
component gets none of it (`childrenOf` 2005 -> 2004 against 2005 -> 4). Item 5 needs no device and
no native code, and it is what makes the landed work reach Angular at all.

The reasoning error worth not repeating: the paragraph asked whether item 5 BLOCKS item 4, got the
right answer, and never asked what item 4 is worth WITHOUT it. A prerequisite and a multiplier are
different questions and only the first was checked.

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

### RE-SCOPED 2026-09-05 after the first two cuts landed and the cost model was MEASURED

Two things in the paragraphs above are wrong about WHERE the desired tree is actually read, and both
would send the next session at the wrong half. Corrected by counting at the `tree.ts` seam rather
than by reading `reconcile`.

**The walk was never re-deriving a child list per visited node.** `reconcile`'s early exit returns
BEFORE the child block, so a Select of one row in a thousand ran `renderableChildren` three times,
not 1 046. Making the list incremental (the cut named "step 2" in §9, landed as
`perf(engine): the commit READS its renderable child list off the record`) takes that 3 to 1:

```
                    before   after
childScans             3       1     the survivor is the synthetic container, marked at every entry
childListsReused       0       2
childrenOf() calls     7       5     counted at the seam, on the same commit
nodesVisited        1003    1003     unchanged
```

**And the five that remain are ALL the container's entry bookkeeping** — `markStructureDirty`'s
copy-on-write check, the two sweeps, the `dlog`, the container's own re-derive. None is inside the
walk. So on an UPDATE the commit already touches no desired structure at all, and the remaining
`node.children` reads live entirely on the CREATE path, where the walk enumerates what to build
(~2 400 on an 800-node create, per §9's own accessor probe).

**So the op log's real consumer is the CREATE path, not the update walk**, and that reverses the
priority the paragraph above implies. It also makes the acceptance criterion sharp and cheap:
`childrenOf` on a 1 000-row create should go to ~0.

**The bottom-up rewrite is priced and it is NOT the answer on its own.** `commitTargeted` already
is a bottom-up drain, so the A/B exists without writing anything: same tree, same change, both
flushed synchronously, it beats the top-down walk by **1.17x** while visiting 3 nodes instead of
1 003. Both must hand Fabric the full thousand-handle child list — Fabric's protocol, which §6a
already says JS cannot remove — so the 1 000 skipped visits buy 15%. And that 15% is measured
against a fake slot whose `adoptChildren` copies the array, so it prices the double as much as the
engine: a bound, not a result. (The first run of that A/B read 0.14x, because the targeted arm was
`await tick()` per iteration and the timer was the measurement.)

**The consequence for the item's remaining half, and it is the uncomfortable one.** Deleting
`node.children` needs something else to answer "what are this node's desired children, in order".
The mirror cannot: `record.children` is the RENDERABLE list, and `record.skipped` loses where the
skipped nodes sat relative to the renderable ones. Giving the record a desired list too is not
removing the skeleton, it is renaming it — the desired copy only truly goes when the record itself
is native (item 8), which is what §9's "the committed copy goes only when something else can answer"
already says from the other side.

So item 4 splits honestly into:

```
4a  the commit consumes the record instead of re-deriving it     LANDED, measured above
4b  the ordered op log, replayed by the commit                   LANDED, measured below
4c  node.children / node.parent deleted outright                 node.children is GONE (4c-3);
                                                                 node.parent STAYS (4c-4, below)
```

### 4b LANDED — the numbers, and the one adapter it does not help

`pendingStructure` is a Map from parent to its ORDERED ops, and the commit replays them onto the
committed renderable list rather than re-deriving from `node.children`. Counted at the `tree.ts`
seam:

```
                    childrenOf() calls per commit     before      after
create 1000 rows, no anchors                            2005          4
append 1000 rows, no anchors                            4006          6
select one row of a thousand                               5          5
create 1000 rows, ONE ANCHOR PER ROW                    2005       2004
```

A create no longer reads the desired tree at all — the four that remain are the synthetic
container's entry bookkeeping. The append row is the MUTATION side, not the walk: the copy-on-write
identity check ran on every structural mutation to answer a question that can only be true once,
and is now gated to the first op of a cycle (2 001 -> 2).

**The last row is the finding, and it makes item 5 the next thing rather than a someday.** A replay
is sound only while a parent's RENDERABLE list and its DESIRED list are the same list — that is,
while it holds no skipped child. An anchor breaks that, so Angular's shape re-derives exactly as
before and gains ~nothing. The precondition is not conservatism: found by the fuzzer as ORACLE 1
when the refusal was per-OP instead of per-PARENT, because a `before` naming an anchor's FLATTENED
grandchild is absent from the desired list (so `linkBefore` appends) and present in the renderable
one (so the replay inserted mid-way). Neither node in that op is skipped; the anchor is, and it is
not in the op.

So **item 5 is no longer "only if the native branch is taken"** — it is what makes 4b work for the
one adapter that mounts an anchor per component, and it needs no device.

That prediction held: item 5 took this row's `childrenOf` from 2 004 to 1 004 and its `childScans`
from 2 001 to 1 001, with the flatten not reached at all. The next section is what shipped.

### Item 5, LANDED 2026-09-06 — an anchor is a POSITION, and the four numbers that say so

Attempted 2026-09-05, reverted the same day after five fuzzer-found bugs, and finished 2026-09-06.
The revert was the mistake: the loop was diagnosing one bug per run and it was stopped one round
short. What follows is what shipped, and the sequencing note is the transferable half — **the
differential went in FIRST on the retry, before the replay it verifies.**

**The split that makes it tractable, and it is the finding.** An anchor is not one thing. A
CHILDLESS one — Vue's `createComment`, Svelte's `ShimComment`, Solid's empty text, Angular's own
`createComment` — punches a hole in the renderable list and reorders nothing, so every renderable
child is still a direct child in order. A HOISTING one — Angular's component hosts, a portal host —
puts GRANDCHILDREN into the list, so a renderable node can be one the desired list has never heard
of. 4b refused both, on `skipped.length === 0`; only the second needs refusing, and only for an op
that carries a `before`. A `hoists` flag on the mirror, set by the flatten, draws the line.

Measured at the `tree.ts` seam, 1 000 rows, one hoisting anchor per row, both arms on one machine:

```
                         4b     item 5
childrenOf() calls     2004       1004     the residual is each anchor's OWN list, read once
childScans             2001       1001     O(1) per anchor against O(children) per parent
childFlattens          1000          0     the derivation is not reached at all
childListsReplayed     2001       3001     the rows replay now, and so does each anchor's child
```

The last row is what says the first three are not an accounting trick: work did not move somewhere
unnamed, it stopped happening. Pinned by `child-list-reuse.probe.test.ts`.

**How the ops splice.** A skipped child's effect on the renderable list is its CONTRIBUTION —
nothing for a marker, its flattened subtree for a hoisting anchor — so the replay splices
contributions instead of nodes. That is literally "an anchor is a position, not a node", done
incrementally rather than by changing `createAnchor`'s contract.

**The refusals that survive, and each is a position the renderable list cannot resolve:**

```
an op naming a node the base HIDES     its block's extent is not held, and recomputing it is
                                       unsound — once the anchor is detached from this parent
                                       there is nothing left for an edit under it to poison
`hoists` and the op carries a `before` a `before` found in the renderable list may be a hoisted
                                       grandchild, which `linkBefore` would have appended past
a `before` that is SKIPPED             a marker paints nothing, so there is no slot in front of it
```

`before === undefined` — an append — is always exact whatever the parent holds, which is why the
create and append paths replay in full.

**The five bugs the first attempt hit are all closed by the FIRST of those refusals**, and that is
the thing the reverted session did not see. It kept trying to recompute a hidden child's old
contribution; refusing to recompute it at all makes four of the five states unreachable and the
fifth (a nested anchor never entering the replay's skipped set) fall out of tracking `flattenPure`'s
`skipped` half. A sixth turned up on the retry's first 15 000-program run and is the same shape:
an anchor removed from its parent and then EMPTIED in the same cycle left its old contribution
standing.

**Two things that must travel with this, both paid for once:**

- **A `before` is typed as a node and is not always one.** Solid's `insertNode` narrows its anchor
  on `!== undefined`, so `insertBefore(parent, child, null)` reaches the engine, where `linkBefore`
  reads it as an append. 4b tolerated it by accident (`indexOf(null)` is -1); item 5 read
  `before.component` and threw. Cost: 30 red tests across six Solid suites, every one reporting a
  MISSING SUBTREE, because the adapter's render guard swallowed the throw. **Nothing in that output
  named the engine**, and the bisect that found it took six arms.
- **Refusing is not free, and an over-wide refusal hides a narrower one.** A `before` the renderable
  list does not hold used to refuse; it appends now, matching `linkBefore` exactly — and the reason
  is not only coverage. While it refused, it caught the skipped-`before` cases first, so THAT
  refusal stayed green under its own break-test (`test-harness-false-greens.md` §20).

**The break ledger is in `replay-child-ops.test.ts`**, six mechanisms broken separately with
disjoint row sets. It also retired a third precondition the attempt had added — that every node the
base hid still answers `isSkippedAtCommit` — which moved nothing when removed, because reaching that
state takes an op naming the child and the first refusal already covers those.

**And the differential is permanent.** `setReplayVerification` / `SYMBIOTE_VERIFY_REPLAY=1`
(commit.ts) re-derives every replayed list through `flattenPure` and throws at the node that
diverged; `commit-fuzz.test.ts` turns it on for every generated program, which is what makes the
next refusal cheap to get wrong safely. It cost one method note the first time round: the first
differential called `renderableChildren`, which DRAINS — a check that mutates what it checks is not
a check, and `flattenPure` exists for that reason.

**What the attempt got right about side effects still holds.** The replayed list matched a pure
re-derive on every one of the first attempt's failing runs; the bugs were in what the derivation
does BESIDES returning a list. So the replay path owes the flatten's other three lines
(`clearPendingWork`, `clearPendingStructure`, `child.committed = undefined`) on the children it
hides — the last two are witnessed by their own rows, and without the third a node that becomes an
anchor off-tree carries a stale Fabric FAMILY back, which is a native abort rather than a misrender.

### The leak the log introduces, because the next log will introduce it too

A SKIPPED node is never reconciled, so `clearPendingStructure` is never reached for it: its ops
accumulate for the life of the process, one unbounded array per anchor. Two changes close it and
they only work as a pair — `renderableChildren` truncates the log when it drops the node, and a
node that STOPS being skipped poisons its own log so it re-derives rather than replaying from a
false empty base.

Worth stating as a property rather than as an incident: **any per-node buffer entry needs an answer
for the nodes the commit never visits.** The buffer already owed one for REMOVED nodes
(`sweepDroppedEdits`); skipped nodes are the second class, and they are not removed — they are in
the tree and permanently unvisited.

### 4c-1 LANDED 2026-09-06 — the last desired-tree read inside the commit

Item 5 left one: `flattenPure(anchor)`, once per anchor per commit, to learn what an anchor puts in
its parent's place. An anchor is an ordinary participant in the buffer — it has an op log, and every
edit that can change its contribution marks that log — so its contribution now REPLAYS from a record
it published last commit (`IContribution`, node.ts: the mirror's twin for the one node the mirror
cannot hold, because an anchor has no Fabric handle).

```
                       4b    item 5    4c-1
childrenOf() calls   2004      1004       4     1 000 rows, one hoisting anchor each
childScans           2001      1001       1     the survivor is the container
childFlattens        1000         0       0
childListsReplayed   2001      3001    3001
```

**The four that remain are the container's entry bookkeeping, and they are the same four a FLAT tree
reads. The commit no longer reads a desired child list on any shape.** Pinned by
`child-list-reuse.probe.test.ts`; the rules and their break ledger are in
`anchor-contribution.test.ts`.

**The bug the fuzzer found on the first deep run, because the next log-walk will meet it too.** An op
log names nodes by IDENTITY and goes on naming them after they move, so two anchors can each hold a
log naming the other while the desired tree stays perfectly acyclic:

```
appendChild(b, a)   b.log = [+a]
appendChild(v, a)   detach -> b.log = [+a, -a],  a leaves b
appendChild(a, b)   a.log = [+b]
tree: v > a > b     acyclic — and a.log names b, b.log names a
```

`flattenPure` cannot hit it (it walks `childrenOf`, which the engine keeps acyclic); a log-walk
recursed forever. Guarded by falling back to `flattenPure`, which is always correct and terminates.
**Any future traversal that follows op logs instead of the tree inherits this**, and the tree being
acyclic is not the property that saves it.

### 4c-2 LANDED 2026-09-06 — `IMirror.desired`, verified against the tree and not yet read

`replayDesired` is the plain twin of `replayChildOps`: it works in desired space, where an op says
exactly what it did, so it has none of that function's three refusals and must stay a line-for-line
mirror of `linkAppend` / `linkBefore` / `unlink`. `verifyDesired` compares its output against
`node.children` under the same `SYMBIOTE_VERIFY_REPLAY` switch. 40 000 programs x 400 steps agree.

It caught the aliasing hazard immediately: `childrenOf` returns `node.children` BY REFERENCE, so
storing it made the record ALIAS the live list — the next cycle then replayed its ops onto a base
that already held them, which REORDERS, because the replay removes a child by identity before
re-inserting it. Exactly what `snapshotCommittedChildren` exists to prevent for `record.children`,
one field over and with nothing protecting it.

### 4c is NOT blocked on what this file said, and the real blocker is smaller and sharper

**The recorded blocker was wrong and is withdrawn.** It read: the mirror cannot answer "this node's
desired children, in order", because `record.children` is the RENDERABLE list and `record.skipped`
loses where the skipped nodes sat — so giving the record a desired list is renaming the skeleton
rather than removing it. The first clause was true of the record as it stood and is now false
(`IMirror.desired`), and the second does not follow: a field the MUTATION writes eagerly and a field
the COMMIT derives from the buffer are not the same thing wearing two names, and only the second can
be handed to a native drain.

What actually stands in the way is one consumer, and it is not in the commit at all:

```
the commit walk           record + ops                     covered, 4c-1 and 4c-2
the flatten and oracle    same                             covered
snapshotCommittedChildren disappears with the aliasing      covered
host-access, hasPendingChild, the container's three reads   answerable from the record
sweepDroppedEdits -> dropSubtree                            NOT covered — see below
```

`dropSubtree` DISCARDS a detached node's op log. That is harmless today because `node.children` is
authoritative; after the switch it is the node's only structure, and a subtree that is parked across
a commit and re-attached later comes back EMPTY. Svelte parks live subtrees, so the shape is real.

Two repairs were on the table and **only one of them works**, which is worth keeping because the
losing one is the intuitive one:

- **Fold before dropping** — the sweep writes the node's desired list into its record before deleting
  the entry. It addresses the WRONG SET. The only nodes the sweep reclaims are nodes that never
  committed (one that HAS committed was drained at that commit, and removal records an op on the
  PARENT), and a never-committed node has no record to fold into. Its ops ARE its structure.
- **Make the buffer WEAK** — `pendingPath` / `pendingProps` as `WeakSet`, `pendingStructure` as
  `WeakMap`; every use is `has`/`get`/`set`/`delete`, so it is mechanical, and the whole
  nominate-then-sweep machinery goes. LANDED. It also fixed a live hazard the sweep had: a subtree
  parked ACROSS commits lost a pending prop write. The cost is `pendingEditCount`, the process-wide
  oracle three rows asserted on; those rows ask a NODE now, which is the better oracle anyway.

### 4c-3 LANDED 2026-09-06 — `node.children` is deleted

`childrenOf` (tree.ts) is the derivation: `committed.desired ?? contributed.desired ?? []`, plus the
node's op log replayed onto it. Nothing maintains a child list at mutation time — `appendChild`
records an op and links the parent, and the list materialises at the commit that consumes the log.
`linkAppend` / `linkBefore` / `unlink` carry only the back-edge now, so `linkBefore`'s `indexOf`
per insert is gone from the mutation path entirely.

```
                          4b     item 5    4c-1    4c-3
childScans, 1 000 rows  2001       1001       1       0     nothing reads a child list
childListsReplayed      2001       3001    3001    3002     the CONTAINER replays too
```

The container was the last holdout: a surface handed it the whole top-level list at once, recorded
as "changed, somehow", so it re-derived on every commit for the life of the app. It arrives as ops
now (`replaceContainerChildren`), and `childScans` is zero on every shape.

**Four things this cost, each of which the next log-backed structure will meet again:**

- **The buffer conflated two questions and had to be split.** A `null` log meant "the RENDERABLE list
  moved unreplayably" AND destroyed the ops. Both callers of that (the anchor climb, a skipped-ness
  flip) poison a parent whose DESIRED list did not change, so `appendChild(P, x)` followed by an edit
  under an anchor child of P threw the `+x` op away. `unreplayable` is a separate WeakSet;
  `pendingChildOps` serves the desired side and `renderableChildOps` the renderable one.
- **The derive paths re-read `childrenOf` AFTER `reconcile` drained the log**, so they saw the
  published base with this cycle's ops already gone: 33 red tests, every one a removed child still
  committing or an inserted one missing — the shape of a lost mutation, with the mutation perfectly
  recorded and simply read too late. The list is read once at the top and passed down.
- **`hideSkippedChild` drops `committed`, which is where the desired children live.** An anchor was
  covered (its contribution is published a moment earlier); nothing else was, and "everything else"
  is not the harmless set it reads as — `setNodeComponent` can turn a node holding children into an
  empty raw text, and an anchor holding children can become one directly, where
  `markPresenceIfFlipped` sees no change in skipped-ness and correctly does nothing. It publishes
  before it drops now.
- **`markPresenceIfFlipped` cleared the contribution on un-skip**, which was right for one day and
  became the same bug: that record carries the desired list, and while a node is un-skipped and not
  yet re-committed it is the only place the children exist. It is dropped where a real record
  supersedes it instead.

**All four were found by the fuzzer's ORACLE 6 and by nothing else**, because every one of them is
invisible in committed output — a hidden node's subtree is not painted either way. That oracle
compares the engine's answer for every reachable node against a model the executor keeps from the
mutations it ISSUES, and it exists because oracle 1 used to read `node.children`: an oracle reading
the derivation cannot report a bug in the derivation. It runs after every STEP rather than at
commits, which is what makes it a locator — asked only at commits it reported the divergence
wherever the next commit fell and shrank to 103 steps naming nothing.

**The general form, because it outlives this item: the desired list can be removed for every node the
commit TRACKS, and the hard cases are all nodes it does not — built, parked, or discarded outside the
committed tree.** Each was closed by giving that node a published record of its own rather than by
keeping a field: the mirror for a live node, the contribution for a hidden one, and the op log itself
for one that has never committed. What remains ours forever is the anchor, which no native structure
can hold — so `IContribution` is the one record item 8 does not take away.

### 4c-4 MEASURED AND REJECTED 2026-09-07 — `node.parent` stays until item 8

The back-edge was deleted, the engine went green (1008 tests, 10 000 fuzz programs x 250 steps, all
six oracles), and it was **reverted on the numbers**. Recorded in full because the item reads as the
obvious next step and the design space is smaller than it looks.

**There is no derivation available, only an index.** `childrenOf` became a derivation because the op
log is keyed by PARENT — the ops for a node's children are all in one place. The reverse question has
no such home: answering "who is this child's parent" from the logs alone means scanning every log in
the process. So 4c-4 is not "derive it like the children"; it is "move one field into a keyed
lookup", which is a different kind of change and has to justify itself on cost alone.

The other candidate — `desiredParent` on `IMirror`/`IContribution` — is strictly more machinery, not
less. A node reparented since its last commit has published nothing, so the record needs a pending
map beside it; that is the same hot-path index PLUS a field, and the field costs an O(children) stamp
at publish that 4c-3 had just removed.

**The measurement, `core/engine/src/__tests__/reconcile.bench.ts`, four interleaved arms per side
(two vitest projects x two passes), reading `min`:**

```
                  before (4 arms)          after (4 arms)          delta
create 1000       1.53 1.59 1.53 1.66      2.24 2.16 2.02 2.14     +32%
replace 1000      2.07 2.01 1.94 1.94      2.90 2.46 2.61 2.64     +27%
create 10 000    42.6 42.5 46.4 45.4      50.2 49.6 49.3 53.8      +16%
append 1000      15.0 14.4 14.7 14.9      16.9 15.1 16.6 16.7      +10%
clear 10 000     68.2 60.8 61.0 68.1      71.6 65.4 71.6 71.2       +8%
select/swap/rm    0.055-0.067              0.056-0.068             flat
```

Zero overlap between the arms on every mutation-heavy row.

**INTERLEAVE, and do not trust two runs taken minutes apart.** The first attempt read the before-arm
once, made the change, read the after-arm, and got a plausible-looking +20% with the after-run's
`rme` three times the before-run's. Re-running the after-arm alone made it look worse again: this
container degrades across successive bench runs, so a sequential A/B measures the container. The
arms above alternate before/after/before/after with a `git checkout` between them.

**Two control arms, and both were worth their three minutes:**

```
strong Map instead of WeakMap   create 1000 1.79-1.84   recovers about HALF the regression
field restored but UNREAD       create 1000 2.13-2.13   identical to the deletion arm
```

The second rules out the explanation everyone reaches for first — that removing a constructor field
changed the object's hidden class. It did not; the index is the whole cost. The first splits the cost
in two: roughly half is the keyed lookup itself and roughly half is WEAKNESS, since every live weak
entry is ephemeron work on every scavenge and the engine scavenges hard (a props object per node per
commit). A strong `Map` is not an escape — it pins every node the adapter ever built, which is the
exact leak the weak buffer was introduced to fix.

**Why the microbenchmark predicted 0.5% and the truth was 16-32%.** A synthetic loop over 200 000
pre-allocated nodes measured `WeakMap.get/set` at 28 ns against 2.3 ns for a field — 12x, which
against ~4.8 us of engine work per created node reads as noise. It models the instruction and not the
GC: the real path holds tens of thousands of live weak entries while allocating heavily, and that
term does not exist in a tight loop over a fixed array. **A microbenchmark of a weak collection
prices the lookup and cannot price the weakness.**

**Where it does land: item 8.** A native `pendingRoot_` answers the parent off the shadow node it
already holds, so the field disappears with no JS index at all — which is the same shape as every
other part of 4c, where the answer came from giving the node a published record rather than from
moving a field sideways. `node.parent` is therefore not debt; it is the one piece of desired
structure whose removal is genuinely blocked on native work.

**And the bench itself was BROKEN at HEAD**, which is why this section can quote numbers only after a
repair commit. 4c-3 deleted `node.children` and left three reads of it in `reconcile.bench.ts`; a
`.bench.ts` is excluded from its package's tsconfig, is not in `vitest run`, and is not in CI, so it
had been throwing on every row for a day with nothing red anywhere. **An instrument rots silently
until the moment someone needs it, and that moment is always mid-decision** — run it after any edit
to the mutation API, not only when a number is wanted.

### 0'' — RETRACTED the same day. Its 17% was measured ACROSS SITTINGS and does not exist

**Read this box before anything below it.** The three-way table in this section — field / strong
array / WeakRef — was NOT interleaved: the field arm and the WeakRef arm were run in separate
sittings and their difference was attributed to the arm. Re-measured 2026-09-07 with the two arms
alternating and nothing else changed, on the same flat row the 17% was claimed for:

```
create 1000 rows (flat), min per arm      field  0.9295 0.9280 0.9211 0.9557
                                          eager  0.9440 0.9234 0.9332 0.9371
                                   mean   field  1.314-1.376   eager  1.322-1.371
```

The eager band sits INSIDE the field band. And the container is what moved: the SAME field code on
the SAME machine read 0.832-0.854 forty minutes earlier and 0.921-0.956 in this run — **+11% drift
on identical code, larger than every effect this section claimed to measure.** Yesterday's "eager"
figures (0.947-0.988) are simply what the field costs in that state.

Confirmed on a nested tree too (9 nodes / 4 parents per row, 9 001 WeakRefs against the flat row's
1 001), interleaved: field mean 11.30 ms, eager 11.00 ms — the direction INVERTS, which is what
being inside noise looks like. A per-node allocation model predicted +19% there and the row shows
none, and that contradiction is what sent the measurement back to be re-run rather than reported.

**So: the WeakRef-per-node arm is free, the "only reclamation costs" framing is wrong, and 0''' —
the lazy refinement — solves a problem that does not exist.** What survives from both sections is
the Hermes runtime table (WeakRef ships, FinalizationRegistry does not) and the method notes.

**The general rule, which this project already had and this section broke:** two arms measured in
different sittings are not two arms, they are two containers. The drift here is 11% per hour. Only
alternate-and-repeat is readable, and the tell that something is wrong is a MODEL that predicts an
effect the row does not show — chase that before writing the number down.

### 0'' — as first written: 8b PRICED 2026-09-07, the table is FREE, id RECLAMATION costs 17%

0' concluded that structure must be READ from a typed-array view rather than called for over JSI.
The obvious next question is what that view costs, and the answer splits in a way that decides 8b's
whole shape. Spike: `parentOf` alone answered from an `Int32Array` row plus a tid→node lookup, with
`childrenOf` left on record+ops so the arms differ by one mechanism. Same interleaved protocol as
4c-4, four arms per side, reading `min`:

```
                             create 1000      replace 1000     create 10 000
field (today)                0.808-0.858      1.079-1.164      20.93-23.24
Int32Array + STRONG array    0.845-0.852      1.100-1.128      21.07-22.18    inside the baseline
Int32Array + WeakRef         0.947-0.988      1.160-1.221      22.53-23.26    +17% on create 1000
WeakMap (4c-4, rejected)     +32%             +27%             +16%
```

**The strong-array arm lies INSIDE the field's own spread on every row**, so an `Int32Array` row
plus an array index is indistinguishable from a field read. That is the load-bearing result: the
structure can leave the node object for nothing.

**The entire +17% is one `WeakRef` allocation per node, and the shape of the numbers says so** — it
lands on `create 1000` (+140 ns/node) and vanishes on `create 10 000`, which is dominated by the
flat parent's child-set re-append. A per-read cost would scale with the bigger row; a per-creation
cost cannot.

So the open question is not "is a native table affordable" — it is **how to reclaim an id on
Hermes**, and that is where the runtime constrains the design:

```
WeakRef               SHIPS. RN's own Fantom itests construct one (ShadowNodeReferenceCounter-itest.js,
                      VirtualView-itest.js) and Fantom runs on Hermes. The Hermes Features.md that
                      lists it "in progress" is STALE — do not quote it.
FinalizationRegistry  ZERO hits across react-native's src/ and Libraries/. Assume absent, so
                      reclamation must be PULL (sweep for dead refs) and cannot be push.
TypedArrays           supported.
```

An id-indexed table needs reclamation because a node's id row outlives the node otherwise, and the
growth is unbounded on any list that scrolls. **A commit-time sweep cannot decide death** — Svelte
parks live subtrees across commits, which is recorded and already paid for once (the weak-buffer
change, 4c-3). So WeakRef sweeping is the only mechanism the runtime offers.

**The refinement worth trying before accepting 17%, and it follows from where the cost landed.**
The hot path never needs an OBJECT: `detach` reads the parent only to record an op against it, and
the bubble only climbs. Both work in tid space. Only the framework boundary (`host-access`'s
`firstChildOf` / `nextSiblingOf` / `parentOf`) must hand back a real node, and that is ~0 calls on a
create against ~4 000 on a keyed swap. So: **keep the hot path in tids and allocate the WeakRef
LAZILY, on the first resolution of a tid back to a node.** A create then allocates none, and the
swap pays for the few thousand it actually resolves.

### 0''' — SUPERSEDED by the retraction above: there was no 17% for the lazy arm to remove

Kept for two things that survive it. The mechanism correction below is real and applies to any
id-keyed table: **the lazy point is the LINK, not the read** — a resolution has only the tid, and
the object it wants is what it is asking for. And the flat-vs-nested bench finding is real and
independent of the arms: every create row was flat, which is why one was added.

What is dead is the conclusion. The lazy arm was built to remove a cost that a cross-sitting
comparison invented, and a WeakRef per node — the form that can actually be SWEPT — is free.

### 0''' — as first written: the lazy arm MEASURED 2026-09-07, the 17% is gone

The refinement above works, and its stated mechanism does not. "Allocate the WeakRef on the first
resolution of a tid back to a node" is not implementable: a resolution has only the tid, and the
object it wants is the thing it is asking for. The lazy point is the **link**, not the read —
`tableSetParent(child, parent)` is the one place a tid and its object are both in hand, and it is
also the only place that ever produces a tid needing resolution, since `parentOf` is the sole
reverse read. So the table allocates one ref per node that IS somebody's parent, never per node.

Interleaved four arms per side, min of the warm block, only `core/engine/src/{node,tree}.ts` and
`node-table.ts` swapped between arms:

```
                        create 1000       replace 1000      create 10 000
field (HEAD)          0.832 0.840 0.841 0.854   1.104-1.122   21.00 21.31 21.52 21.91
lazy WeakRef table    0.830 0.855 0.864 0.858   1.106-1.134   21.25 21.53 21.76 21.93
eager WeakRef (0'')   0.947-0.988               1.160-1.221   22.53-23.26
```

The eager band does not touch the field band on `create 1000`; the lazy band overlaps it and its
minimum is the lower of the two. **So the per-node allocation was the whole 17%, and moving it to
per-parent removes it.**

**But that table is measured on a FLAT tree, and read alone it is a best case dressed as a result.**
`makeRow` builds ONE node, so `create 1000 rows` mounts 1 001 nodes under a single parent — the lazy
arm allocates exactly one WeakRef for a thousand nodes. Every create row in `reconcile.bench.ts` was
that shape, so the bench was structurally incapable of pricing anything that scales with the number
of PARENTS, which is precisely what this design does.

`create 1000 nested rows` was added for it (`makeAppRow`: 9 nodes — a row View, three Texts each
wrapping a RawText, two button Views — so 4 parents per row, 4 001 refs against 9 001 nodes, the
density a real screen has). Eight samples per arm, warm and cold blocks:

```
                min     median    band
field          6.023     6.10     6.02 - 6.81
lazy table     6.082     6.28     6.08 - 6.90
```

+1.0% on the minimum, ~3% on the median, against a field arm whose own spread is 13%. **No verdict
at that size — what the row establishes is a bound, not a number: the residual is under ~3% where
the eager arm was 17%.** Resolving 3% against a 13% spread is not worth the samples; the design
decision does not turn on it.

Two things follow for item 8. The table is affordable end to end, so 8b is buildable rather than
merely priced. And id reclamation stays the open question, unchanged — the lazy arm allocates
fewer refs, not none, and `nextTid` still never reuses a row.

**The instrument lesson is the transferable half, and it is bigger than this measurement.** A create
benchmark over a flat tree is not a create benchmark. It prices per-node work correctly and is
blind, by construction, to per-parent, per-depth and per-subtree work — and the blindness reads as
a clean result rather than as a gap. The first arm of this run measured free and was worthless.
Before pricing a change, ask which structural quantity its cost scales with, and check the bench
actually varies that quantity.

**And the repair of a rotted instrument is not done until the WHOLE instrument runs.** The bench was
fixed on 2026-09-06 after 4c-3 deleted `node.children`; three reads were repaired and a fourth
survived in `app-shaped: windowed list steps one row`, because verification ran only the rows that
run's numbers came from. It stayed broken for a day. The check is one full `vitest bench --run` of
the file — 52 rows, no filter — and the editor's type-checker found it in a second once the file was
touched, which is the other half: a `.bench.ts` is excluded from its package tsconfig, so an LSP
diagnostic is the only type signal that reaches it at all.

**Two method notes from this run, both of which nearly cost the measurement.**

`npx tsc --build` in a worktree with no `node_modules` resolves to a DECOY package that prints
nothing, and the rtk wrapper reported "TypeScript compilation completed" over it — a false green of
exactly the shape `test-harness-false-greens.md` §6 records, arrived at from a new direction (the
tool was missing, not lying). `rtk proxy` showed the decoy's real banner. Install first, and never
read a bare `tsc` exit through the wrapper.

And a fresh worktree can be many commits BEHIND the branch it is on — this one was 8 behind, so the
first `git log` showed a tree without any of 4c. Fetch and compare against the remote before reading
any file as current.

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

## State on 2026-09-08: the JS tree is gone; the DEVICE half is not wired

Both halves stated together, because the first is easy to read as the second.

**Gone, and checked rather than asserted.** `ISymbioteNode` carries an ADDRESS plus five
engine-owned flags — `component`, `isText`, `listeners`, `hasAriaAlias`, `payloadFold`,
`styleParts`. No `props`, no `children`, no `parent`, no `committed`, no dirty pair.
`tests/engine-structure-seam.test.ts` resolves the engine barrel through the TypeScript checker and
reports ZERO structural field reads outside `core/engine/src/host-access.ts`, with a synthetic
break-test proving the audit can fail. The one JS tree left is
`core/test-utils/src/tree-applier.ts`, and it lives there ON PURPOSE: `core/test-utils` is a
devDependency of every adapter, so nothing an app loads contains it.

**Buffer architecture, end to end, headlessly.** Adapter mutations → ten opcodes in a flat
`Int32Array` + side tables → `ITreeHost.applyOps` → the TypeScript applier → the fake Fabric slot.
5 529 tests run exactly that path, so the C++ is not the sole implementation of an uncovered
algorithm — it has an oracle.

**UPDATE, same day: gaps 1 and 2 are closed and gap 3 is answered rather than closed.** ABI v4 —
`applyOps(ops, strings, values, instanceHandles, handles)` plus `getProp` / `getViewName` /
`parentOf` / `childrenOf` / `committedRecordOf`; `census` deliberately off the wire (one JS caller,
diagnostics only, would cost a native walk). `native-tree-host.ts` builds an `ITreeHost` over the
bindings and `getSlot()` installs it, never displacing a host `installFabric()` already put in.
`SymbioteEngineBindings` binds `Tree`. `SymbioteFabricProps.{h,cpp}` carries the fold, wired into
`materialize` on both the create and the clone path. **None of the C++ has been compiled** — no
build was run, by rule; the correctness argument is agreement with the TypeScript applier.

Three findings from that pass that outlive it:

- **A handle carries exactly ONE `NativeState`.** Binding `Tree::applyOps` while leaving the
  imperative five on `Applier` ships them broken: `Applier::nodeFrom` casts to its own state type
  and every `measure()` throws "foreign native state" on the first call. The five moved with the
  applier, and the general rule is that a `NativeState` swap takes everything reading that state.
- **`applyOps` is the same NAME at two arities**, so nothing structural tells a v3 pod from a v4
  one. `batching-slot.ts`'s `via: 'native'` arm sends a six-argument encoded FABRIC batch; a v4
  binary would read `strings` where it sends `childIds` and commit a wrong tree in silence. Guarded
  by ARITY (`isEncodedApplier`), with `getSlot()` refusing and naming the supersession.
- **`node.payloadFold` does not move to C++, and the reason is the open registry.**
  `registerHostBehavior(tag, behavior)` accepts any tag, so a third-party native view can ship a
  fold a native table was never told about — that is correctness, not cost. `hasAriaAlias` DOES move
  (it is a memo, not a fact: sticky, and `foldAriaProps` re-checks presence itself), and recomputing
  it in C++ is cheaper than the JS probe because it scales with the bag rather than a fixed 15-name
  list. What stays lost on the lowered path until the fold moves to the JS side of the wire:
  `Pressable`'s `disabled` -> `accessibilityState.disabled` (a button announced ENABLED to a screen
  reader) and `android_ripple`; `TextInput`'s `inputMode` / `enterKeyHint` / `readOnly` /
  `blurOnSubmit` and the `underlineColorAndroid` default; `Switch`'s colour props and its boolean
  coercion. Every one silent on device.

**The state below is what it was BEFORE that pass. Kept because the three gaps are the right way to
read what the seam needed:**

```
1  nothing calls setTreeHost except installFabric()   treeHost() is undefined on a device, so
                                                      commitSurfaceOps returns early and the ops
                                                      stay pending forever
2  SymbioteEngineBindings.cpp binds Applier, not Tree the new C++ tree compiles and is unreachable;
                                                      the bound applyOps is still the batching-slot
                                                      path
3  SymbioteTree.cpp has no payload fold               fabricProps is JS-only, and two of its three
                                                      node-side inputs (hasAriaAlias, payloadFold)
                                                      are JS facts — a design step, not a translation
```

(1) and (2) are the same missing seam seen from the two sides: something has to construct an
`ITreeHost` over `nativeEngine()`'s bindings and install it, and the bindings have to expose `Tree`.
(3) is the one that needs a decision rather than wiring.

Do not read "the JS tree is gone" as "we are on the buffer on device". The first is finished; the
second is three named pieces away.

## What of RN's C++ tree can be REUSED instead of re-derived — surveyed 2026-09-09

Asked because "we built our own tree again, one layer down" is the right objection and nobody had
enumerated the answer. Five parallel reads of `.vendors/react-native` (RN 0.86). Cite the line, not
this table — a verification is a timestamp.

```
our Node field        RN's holder                          verdict
tag/instanceHandle/   ShadowNode + ShadowNodeFamily        ALREADY THERE — 8 fields are duplicates
viewName/committed*
selfDirty, pathDirty, ShadowNode.h:285                     MOVABLE — see the slot below
foldProbe, committed-   runtimeShadowNodeReference_
ViewName/TextAncestor/
Renderable, committedParent
anchors (kKindAnchor)  display:contents + ForceFlattenView  EXPRESSIBLE as a real ShadowNode
parent                 ShadowNodeFamily::parent_            NO — four independent reasons
props as authored      Props::rawProps                      NO on iOS — Android-only ifdef
children pre-commit    —                                    NO — no ShadowNode exists yet
anything via Yoga      yoga::Node                           NO — subset graph, owner poisoned
```

### The enrichment slot RN maintains for us

`ShadowNode.h:285` `mutable std::weak_ptr<ShadowNodeWrapper> runtimeShadowNodeReference_`, public
setter at `:202`, and `ShadowNodeWrapper` (`:290`) is a non-`final` `struct : jsi::NativeState`.
`ConcreteComponentDescriptor.h:85` transfers it inside `cloneShadowNode`, so the carry-over runs on
every clone of every node with no descriptor of ours. A `SymbioteNodeWrapper : ShadowNodeWrapper` is
therefore the sanctioned place for per-node bookkeeping. Two conditions: the strong owner must be
the JS object's NativeState, and the transfer only enters when `fragment.runtimeShadowNodeReference`
is set — `updateRuntimeShadowNodeReferencesOnCommit` defaults off
(`featureflags/ReactNativeFeatureFlagsDefaults.h:326`), so we set it per clone rather than rely on a
flag. UNVERIFIED on device.

### Why `parent` cannot come from the family

`ShadowNodeFamily.cpp:120` — `if (hasParent_) return;` plus an assert that the parent never changes.
Four reasons, any one sufficient: anchors have no family at all; the value is written at
`materialize`, one commit after every seam that asks; it is write-once, so `parentOf` would hand JS
a WRONG parent rather than `undefined`; and the assert is live — the string
`parent_.lock() == nullptr || parent_.lock() == parent` is present in the shipped Debug
`React.framework`, because CocoaPods adds `-DNDEBUG` only in Release
(`scripts/cocoapods/utils.rb:651`).

Latent consequence, static inference, NOT device-verified: `materialize`'s `needsFreshFamily` path
creates a fresh family and then `appendChild`s reused child nodes whose families still name the old
parent — which is exactly the assert's condition. Debug-only, cross-parent move only.

### `display: contents` is RN's fragment

`ShadowNodeTraits.h:73 ForceFlattenView` ("Forces the node not to form a host view"), set at
`YogaLayoutableShadowNode.cpp:400` from that style value alone.
`sliceChildShadowNodeViewPairs.cpp:113-125` hoists such a node's children into the parent's slot and
`Differentiator.cpp:340-361` emits no mutation for it. Yoga skips it too —
`yoga/node/LayoutableChildren.h:82-110` descends through contents nodes in place — so it contributes
no box and does not break the parent's flex, which was the expected killer and is not one. Cost is a
Yoga node, a family, and `cloneContentsChildrenIfNeeded` per layout, so for Svelte's ~12 anchors per
row this is a MEASUREMENT, not a foregone win.

The reason nobody had noticed: React's fragments never reach the host config, so "the tree above the
host holds no non-painting node" is an assumption of REACT'S RECONCILER, not of Fabric.

### Two doors that are open and lead nowhere

Registering our own `ComponentDescriptor` is genuinely available from outside RN
(`ComponentDescriptorProviderRegistry.h:34`, the route every third-party Fabric component takes) and
is the ONLY way to reach `ShadowNodeTraits` bits or a typed `State`. It costs writing our own
`ShadowNode` over `YogaLayoutableShadowNode` and our own component view — the objection this survey
answers, one layer lower. And `UIManager::updateState` runs a `cloneTree` plus a full commit per
write (`UIManager.cpp:397`), so `State` is not a home for per-node flags. Ruling this out rules both
out permanently.

### And the survey's own premise was wrong: the tree is not the cost

Measured headlessly the same day. A Select-shaped commit on 10 002 nodes runs `createNode 0 /
appendChild 0 / clone 3` in 0.3 ms — the reuse fast path fires and `fabricProps` never runs for a
clean node. The ~105 ms sat inside Fabric, because `materialize` handed `cloneNode` a child list on
every clone. See "A child list is not a free argument" in `SymbioteTree.cpp`. Before optimising the
shape of our tree, price what it actually asks Fabric to do.

## What actually makes Fabric re-measure text — read 2026-09-09, every line cited

A text measurement is the one term in a commit that costs tens of microseconds, and four plausible
causes for it are false. Each was refuted by the source, not by argument:

```
progressState clones the tree      ShadowTree.cpp:83,177 — .props = propsPlaceholder(), i.e. NULL.
                                   So enableStateReconciliation cannot dirty a Paragraph. Flipping
                                   that flag is not an experiment; it answers nothing.
our cloneNode dirties every node   UIManager.cpp:123 — props starts as propsPlaceholder() and is
                                   replaced ONLY if !rawProps.isEmpty(). An empty-props clone hands
                                   a null fragment and trips no gate.
a yoga clone loses its cache       Node.h:43 — Node(const Node&) = default, so layout_ (measurement
                                   cache included) is copied. Cloning alone measures nothing.
adoptYogaChild's swap is the cost  bench arm: cloning and swapping ALL 1000 rows = 0 measures,
                                   0.22 ms. It is free.
```

What IS true:

- **`didMeasureText` fires only inside the cache-miss generator** (`TextLayoutManager.mm:44`), so a
  measurement count is a count of MISSES against `SimpleThreadSafeCache`, an LRU capped at 1024
  (`TextMeasureCache.h:96`), keyed on (attributedString, paragraphAttributes, layoutConstraints).
  A thousand rows of distinct text have no chance of fitting.
- **The per-node cache is off.** `measuredLayouts_` is only consulted under
  `enablePreparedTextLayout`, whose default is `false` (`ReactNativeFeatureFlagsDefaults.h:206`).
  The 1024-entry LRU is therefore the ONLY cache in the path.
- **The dirtying gate is `completeClone`** (`YogaLayoutableShadowNode.cpp:159`): a MeasurableYogaNode
  is dirtied when `fragment.children` is non-null OR `shouldNewRevisionDirtyMeasurement` says so.
- **The base `shouldNewRevisionDirtyMeasurement` returns `true`** (`:322`) and **only `Paragraph`
  narrows it**, to `fragment.props != nullptr` (`ParagraphShadowNode.cpp:64`). Grep confirms there
  is no third override. So a `<Text>` survives an empty-props clone and a `TextInput` does not —
  ANY fragment re-measures it.

The consequence for reading a benchmark: a measurement count and a write count are not two views of
one thing, and neither says which side dirtied the node. Count the clones the HOST issued with a
props payload (`propClones` on the commit split) and read it against `textMeasures`. Near the write
count means the dirtying is inside Fabric's commit; near the measurement count means it is ours.
That arm exists because RN's telemetry counts measurements and never says who asked.

### The measurement hunt, and the six things it eliminated — 2026-09-09

A one-row mutation on a 1 000-row tree reported 2 869 text measurements against a full create's
1 890, on the identical tree with identical strings. Six hypotheses were killed, each by an
instrument rather than by argument. Do not re-open one without a new instrument:

```
our own clones          a `propClones` counter on the commit split: 2 on Select, 0 on Swap,
                        against 2 869 measurements. Nothing our walk does causes them.
Fabric replacing        a `textSwaps` counter splitting `adoptSwaps` by component name: 13 per
Paragraphs              commit, and it scales with rows we TOUCHED (Partial: 114 for 100 rows).
                        So `content_` survives and no cache key is re-derived by a clone.
text content            a probe making the row's one repeated string unique moved Create 1890 ->
                        2917 (predicted 2889) AND Select 2869 -> 3900. The gap between them was
                        unchanged, so duplicate collapse is real and is NOT the difference.
TextInput               a probe making its value a constant across 1 000 rows moved TEXTS by
                        ZERO, while WRITES fell by 100 — so the probe was live and the input
                        contributes no text measurement at all.
a dirty container       `core/engine/bench/yoga-relayout.cpp`, arm "EVERY row style changed":
                        0 measures, 7 001 recomputed. A dirty flex parent does not re-measure its
                        leaves at any depth.
our commit options      `UIManagerBinding.cpp:483` — React's own `completeRoot` passes
                        `{enableStateReconciliation = true, mountSynchronously = false,
                        source = React}`, byte-identical to ours.
```

What the numbers say, and it is not "text measurement is expensive": five mutations of wildly
different size (233 / 35 / 33 / 34 writes) all report 2 867-2 869. A count that does not move with
the change is not work caused by the change — it is a steady state. ~1 890 distinct cache keys
against `kSimpleThreadSafeCacheSizeCap = 1024` thrash to ~96% misses, and a create reads lower only
because a cold cache asks each key exactly once.

**The open question is one level up and nobody has answered it: why is every measurable leaf
measured again when its ShadowNode was not cloned, its yoga node is the same object, and
`layout_` — which carries the measurement cache and is copied by `Node(const Node&) = default` —
was never touched.** Yoga re-measures only on `isDirty`, a config-version bump, or an owner
direction change (`CalculateLayout.cpp:2259`), and the second and third are excluded: the clone
copies pointScaleFactor and errata forward, so versions match.

The one discriminator left is `examples/bare-rn` — same tree, same RN, React driving instead of us.
It cannot take a `@symbiote-native/*` dependency, so reading the same telemetry there needs its own
native path. Until that runs, "this cost is React Native's" is unproven and so is the opposite.

### ANSWERED — the tree-wide re-measure is OURS, and the number to chase is `layoutNodes`

The open question above is closed. `examples/react/index.js` carries a `STOCK_ARM` constant that boots
React Native's OWN Fabric renderer against the same row in the same binary
(`screens/StockBenchmarkScreen.tsx`), and `readSurfaceTelemetry(surfaceId)` reads RN's telemetry for
a surface this host never drove. One simulator, one tree, one difference: which renderer commits.

```
                 React's renderer      ours
create  texts          1896            1890     the cold sweep AGREES — same tree, same keys
        layout        58.0 ms         68.0 ms
        nodes          7005           ~7000
select  texts             0            2869     React re-measures NOTHING on a one-row change
        layout          3.9 ms        105.0 ms
        nodes          1006            8477
clear   texts             0             959
        nodes             7           ~7000
```

Two things this settles and one it redirects:

- **The cost is not React Native's.** Every "a Fabric commit just costs this" reading is dead.
- **The row is faithful.** 1896 vs 1890 on the create arm is the control that says the two screens
  build the same tree with the same strings, so the select arm's 0-vs-2869 is about the driver.
- **Text is the SYMPTOM; `layoutNodes` is the disease.** The bench already proved only a dirty LEAF
  produces a measurement, and our commit reports 8 477 affected layoutable nodes against React's
  1 006 — the whole tree versus one row's worth. Chase what dirties layout tree-wide; the text
  number will follow it down.

And the harness is the durable part: any candidate fix can now be A/B'd against React's own renderer
on one binary, instead of against a memory of last week's numbers.

### FIXED — the host held nodes Fabric had already replaced, so every commit re-measured the tree

`adoptCommitted` in `SymbioteTree.cpp`, run after `completeSurface` from inside the same registry
visit that reads the telemetry.

**The mechanism, and it is one sentence.** Yoga clears a node's dirty flag on the object it laid out
(`CalculateLayout.cpp`, `setDirty(false)` under `performLayout`). Fabric substitutes clones for
nodes handed to it — `adoptYogaChild` clones any child whose yoga owner is still its previous
parent — so the objects that got laid out were the clones, and this host went on holding the
originals. Those stayed dirty forever, and every later commit handed Fabric a tree whose every
measurable leaf was dirty. A 33-write `Swap` therefore re-measured 2 867 texts.

**The number that found it** was `dirtyTexts`, which counts dirty measurable nodes in the tree
BEFORE the commit: it read **4 971 on every single step**, including the one straight after a full
layout. A count that does not move after the work that should have cleared it is not a cost, it is
a leak.

`adoptLandedChildren` had been doing this since earlier the same day and was not wrong — it is just
scoped to children of nodes the walk MATERIALISED, which on a one-row change is a handful. The other
999 rows kept stale pointers. The new pass re-points the whole tree from the committed revision,
descending only where pointers differ (a ShadowNode is immutable, so an identical pointer means an
identical subtree), and refuses to adopt a node of a different FAMILY — `completeSurface` returns
void, so a cancelled commit leaves the registry on the previous revision and walking that would drag
the tree backwards.

```
              TEXTS         NODES         DIRTY        FABRIC        wall
Create     1890 -> 1890  8477 -> 7041  4971 -> 4001  69.5 -> 65.7  288.7 -> 284.4
Partial    2868 ->   98  8477 -> 1541  4971 ->  200 108.5 -> 10.5  126.1 ->  27.0
Select     2869 ->    2  8477 -> 1046  4971 ->    1 116.5 ->  2.5  121.3 ->   6.9
Swap       2867 ->    0  8477 -> 1041  4971 ->    0 114.4 ->  3.1  138.1 ->  26.8
Remove     2868 ->    1  8470 -> 1040  4967 ->    1 109.6 ->  3.5  203.5 ->  93.2
Clear       959 ->    1  1477 ->   41   971 ->    1  71.5 ->  1.6   78.7 ->   8.4
```

`NODES 1046` against React's own renderer's 1006 on the identical tree is parity. Create is
unchanged and that is the control: a freshly created measurable node is dirty by definition, so
there was never anything to clear there.

**The method worth keeping, because it is what turned six weeks of plausible stories into a fix.**
Every hypothesis in this hunt was killed by an instrument rather than by argument, and the two that
mattered most were the cheapest: a counter reading a number that never changed, and a second
renderer committing the same tree in the same binary.
