---
name: symbiote-engine-core
description: "Symbiote engine core — how to drive @symbiote-native/engine correctly, read BEFORE writing or debugging any core/engine/** code OR any adapter renderer seam (host-config / createRenderer / Renderer2) that calls the engine. The engine is a retained MUTABLE shadow-tree that the engine alone translates into Fabric's persistent CLONE-ON-WRITE child sets; every adapter drives the same tiny mutation API and NONE re-implements persistence. Covers (1) the MUTATION API in core/engine/src/node.ts — createElement / createRawText / createAnchor / appendChild / insertBefore / removeChild / setProp / setEventListener / setText, and the ONE entry point flat-bag adapters use, routeProp (it decides onX→event-vs-prop via the ViewConfig, strips React __self/__source, attaches responder events) — do NOT pre-split events yourself. (2) NODE IDENTITY — each node carries its committed Fabric record in its OWN `committed` field (node.ts, IMirror), read through the guarded `committedOf(node)`; every imperative API resolves through it and bails if absent, so a node must be held by IDENTITY, never wrapped (Vue reactive Proxy is the classic break — see vue-adapter-reactivity). This was a `WeakMap<ISymbioteNode, …>` side table until 2026-08-22; collapsing it into a field is what makes 'the engine builds its own second tree' factually wrong (ISymbioteNode IS the framework's host node, as fiber.stateNode is React's) and removed a WeakMap lookup per VISITED node per commit — measured 12-14% on a 10 000-node flat walk, nothing on a bushy screen where dirty-marking already keeps visits low. (3) THE COMMIT — SymbioteSurface.commit() (sync, React resetAfterCommit) vs requestCommit() (microtask-coalesced, reactive frameworks) → commitChildren → reconcile → completeRoot; clone-bubble (a leaf change re-clones ancestors); anchors are skipped. (4) THE IMPERATIVE/NATIVE BRIDGE in commit.ts — dispatchViewCommand / measure / measureInWindow / measureLayout / getNativeTag / getNativeNode / setNativeProps / sendAccessibilityEvent, all mirror-gated, all SILENT no-ops before commit, DEBUG=1 logs 'node not committed'. (5) whenCommitted(node, action) + the post-commit.ts seam — the fix for any native call wired before the tag exists under async commit. (6) dlog / isDebug gating. Trigger on engine work, on writing/porting a renderer seam, on any imperative native call, or on a 'command silently does nothing' / 'works on React, dead on Vue' symptom."
---

# Symbiote engine core — driving `@symbiote-native/engine`

The engine is the shared half every adapter sits on. It does exactly two things:
it holds a **retained, mutable shadow-tree** of `ISymbioteNode`s that adapters
mutate cheaply, and it translates that tree into Fabric's **persistent,
clone-on-write** child sets at commit. The mutable-tree → persistent-mirror
trick is the R2 core and it lives ONCE here, so no adapter re-implements
persistence (`<clone_on_write_lives_in_engine>`).

If you are writing a renderer seam (React host config, Vue `createRenderer`,
Angular `Renderer2`), your whole job is to map your framework's node ops onto the
API in §2 and pick a commit strategy in §4. Everything below the mutation API —
clone-on-write, Fabric tags, ViewConfig event inference, responder negotiation,
platform routing — is the engine's, not yours.

## 1. The one fact: mutable tree in, persistent tree out

```
adapter (React / Vue / Angular)
   │  createElement / appendChild / routeProp / removeChild …   ← cheap, synchronous, mutable
   ▼
ISymbioteNode tree   (core/engine/src/node.ts)                   ← the retained shadow-tree YOU mutate
   │  surface.commit() | requestCommit()                        ← §4
   ▼
reconcile  (core/engine/src/commit.ts)                           ← clone-on-write, ENGINE-owned
   │  reads/writes each node's own `committed` record (node.ts) — no side table
   │  createChildSet / cloneNodeWithNewProps / completeRoot
   ▼
nativeFabricUIManager  →  Fabric C++ / Yoga / RCTFabricSurface  ← never forked
```

You mutate the node tree directly (it's a plain mutable object graph). The engine
diffs it against what Fabric currently holds and clones only what changed.

## 2. The mutation API — `core/engine/src/node.ts`

The entire surface an adapter drives. Read `node.ts` first (it's ~215 lines and
self-contained); it is the canonical entry point to the whole engine.

```
createElement(component: string, isText = false): ISymbioteNode   // component IS the Fabric view name (RCTView, RCTImageView…)
createRawText(text: string): ISymbioteNode                        // RCTRawText with { text } pre-set
createAnchor(): ISymbioteNode                                     // '#anchor' — retained for sibling order, SKIPPED at commit

appendChild(parent, child)                                        // detaches child from old parent first
insertBefore(parent, child, beforeChild)
removeChild(parent, child)

routeProp(node, key, value)     // ← THE flat-bag entry point (React/Vue/Solid). See below.
setEventListener(node, name, value)   // explicit event channel (Angular listen / Svelte addEventListener call directly)
setProp(node, key, value)             // pure prop set, no event inference (undefined deletes)
setText(node, text)
```

**`routeProp` is the one call a flat-bag adapter routes every prop through — do
NOT pre-split events yourself.** It decides, per the shared ViewConfig:

- an `onX` prop becomes an **event listener** ONLY if the node's `component`
  actually declares `x` as an event (`isEventFor`). So `onTintColor` on a Switch
  (whose only event is `change`) is a plain prop and reaches Fabric — naming
  never decides.
- it attaches the PanResponder responder events (`startShouldSetResponder`…),
  which are a JS protocol, not ViewConfig events.
- it strips React's JSX dev metadata (`__self` / `__source`) — a JSX-based adapter
  that forwards these paints the surface black on Android (`folly::dynamic`
  rejects the function-bearing `__self`). The engine drops them once, here.

A **structural** adapter (Angular `Renderer2.listen`, Svelte `addEventListener`)
already knows the event name, so it calls `setEventListener(node, 'press', cb)`
directly and routes only `[prop]` bindings through `routeProp`.

## 3. Node identity — the rule that bites every adapter

`ISymbioteNode` (`node.ts`) is a branded plain object: `{ component, isText,
props, listeners, children, parent, dirty, propsDirty, structureDirty, committed }`.

The three flags answer three different questions, and blurring them is what the split fixed:
`dirty` = descend into this subtree; `propsDirty` = this node's own payload can differ;
`structureDirty` = this node's own CHILD LIST can differ from the committed snapshot. The last
one is a correctness precondition, not an optimisation — see `commitTargeted` in §4a.

The `committed` field IS the mirror of what Fabric holds for this node — handle, reactTag,
rootTag, the flat props last sent, the child identities last committed, the
resolved view name — and every imperative API (§5) resolves through it.

**It lives on the node, and that placement is load-bearing for how you describe
this project.** Until 2026-08-22 it was a `mirror = new WeakMap<ISymbioteNode, …>()`
in `commit.ts`, which read — fairly — as "the engine keeps its own second tree
beside the framework's". It never did: `ISymbioteNode` is the host node the
framework's own renderer creates and mutates (React `createInstance`, Vue nodeOps
`createElement`, Angular `Renderer2.createElement` all return one), exactly as
`HTMLElement` is in a browser. A host node carrying its native binding is what
React does too — `fiber.stateNode` holds the same `{node, canonical}` pair from the
same `createNode` call. There is ONE tree, the framework's, and each of its nodes
remembers what it committed.

**With one exception, and it is a real one: Svelte.** Svelte 5 compiles to DOM calls, not to a
renderer seam, so `@symbiote-native/svelte` ships a DOM shim (`adapters/svelte/src/dom-shim/`,
~1 000 lines across `element` / `text` / `comment` / `document` / `document-fragment` /
`patch-globals`) and its host node is a `ShimNode`, NOT an `ISymbioteNode`:

```ts
// adapters/svelte/src/dom-shim/shim-node.ts:48
export abstract class ShimNode {
  parent: ShimNode | null = null;
  children: ShimNode[] = []; // its own parent pointer and child array
  engineNode: ISymbioteNode | undefined; // and a reference to the engine's
  surface: SymbioteSurface | undefined;
}
```

So under Svelte there genuinely ARE two retained trees, and a mutation is performed twice — once in
the shim tree, once in the engine tree. It is the one place where the "we built our own tree"
objection to this architecture is factually correct.

**The tax is proportional to how many nodes an operation CREATES OR DESTROYS — not to whether the
operation is "structural".** Device, iOS 26.5 simulator, **Release**, 1 000 rows × 9 views,
2026-08-23 — Svelte against our React adapter on the same engine:

```
              Create  Replace  Append  Clear | Partial  Select   Swap  Remove
svelte         491.5    752.2   635.9   34.6 |   13.0     7.4     8.2     9.1
react          232.9    257.0   323.7    7.0 |   22.1     7.0    29.0    86.5
              2.1x     2.9x    2.0x    4.9x  |    win     tie     win   win 9.5x
                     ~9 000 nodes moved     |      a handful of nodes moved
```

The split is clean and it is the node count, not the operation kind: `Clear` destroys 9 000 nodes
and Svelte pays 4.9x for it, while `Remove` destroys 9 and Svelte wins 9.5x. Every cell on the left
builds or tears down a shim node per engine node; every cell on the right does not.

**A Debug run got this badly wrong and it is worth knowing how badly.** The same comparison in
Debug read `+13.6% / +16.0%` on Create/Replace and put `Clear` at +100%; Release says 2.1x / 2.9x /
4.9x. Debug preserved the SHAPE of the effect (which columns lose) and understated its SIZE by
roughly threefold. Use Debug to find where to look, never to say how much.

When a Svelte-vs-other-adapter gap shows up on create-shaped work while `ms / commit` says the
ENGINE walk was cheap, this is the first place to look — not `commit.ts`.

**Hold engine nodes by identity. Never wrap one in a structure that proxies it.**
The classic break is Vue's `ref(node)` deep-wrapping the node in a reactive Proxy.
The Vue-specific manifestation and fix (`shallowRef` / `markRaw`) is its own skill:
**`vue-adapter-reactivity`** (Gotcha 1).

**Read the record ONLY through `committedOf(node)`, never as a bare
`node.committed`.** The WeakMap used to catch a wrap for free — a Proxy is a
different object, so the lookup missed and the call bailed with a clear "node not
committed". A plain field read does NOT: a Proxy forwards `proxy.committed`
straight to its target and hands back a real record, whose `handle` a deep
reactive would then wrap on the way out — and that handle is a JSI host object, so
the Proxy reaches `cloneNodeWithNewProps` and fails deep in native, far from the
cause. `committedOf` restores the check explicitly: the record names its `owner`,
and `record.owner !== node` means the object handed in is not that node. Locked in
by `core/engine/src/__tests__/node-identity.test.ts`, including the deep-proxy case.

## 4a. Two commit routes — general, and targeted at a SET of nodes

`commitContainer` walks DOWN from the synthetic root: correct for everything, and it visits every
sibling along the path just to hand back the handle their committed record already held. On a
17 504-node app that is 37 visits to re-commit one node, of which 33 are early exits.

`commitTargeted(node)` (commit.ts) is the other route, and `setNativeProps` — the JS-driven
Animated frame path — takes it: clone the node, then clone each ancestor up the `committed.parent`
chain, reusing every sibling handle straight off its own committed record. Never walks down. It is
the JS twin of what Fabric does natively for the same operation (`UIManager::setNativeProps_-
DEPRECATED` → `shadowTree.commit(cloneTree(family, …))`), minus that API's stickiness: RN's version
stores the payload on the ShadowNodeFamily and re-applies it over React's props on every later
clone, so a declarative write of the same prop can never win again — which is why it is named
`_DEPRECATED`. Ours has no such side effect.

**`setNativeProps` does not commit — it QUEUES.** Every write made in one task publishes together
at the microtask boundary (`flushNativeProps`, not on the public barrel), so a frame with five
animated leaves is one `completeRoot` instead of five. Two consequences you will meet before you
meet the perf win:

- **A test that calls `setNativeProps` (or drives an `Animated.Value`) and reads the committed tree
  on the next line reads the tree from BEFORE the write.** One `await Promise.resolve()` fixes it —
  or nothing at all if the test already awaits its framework's own tick, which is why Solid's
  Animated tests needed no change when this landed and React's, Vue's and Angular's did.
- **The queue never merges two writes to the SAME node.** Merging writes to different nodes is
  free — each carries its own value and one commit publishes them all. A second write to a node
  already pending would genuinely drop the first, so it does not merge: it flushes the pending
  batch synchronously and opens a new one. Stated as the contract the tests pin:

```
N writes to N different nodes in one task  ->  one completeRoot, all N values land
two writes to the SAME node in one task    ->  two completeRoots, both values land, in order
```

The second row costs nothing in practice — an `Animated.Value` ticks its props node once per rAF
(`animations/timing.ts`'s `onFrame`), so concurrent animations are always distinct nodes. It
exists for the paths that really can write twice: two animations on one prop of one node, or
`Animated.event` when the host delivers two scroll events in one task.

The batch clones the UNION of the ancestor chains, and that is not a detail — batching to a general
walk instead measured 1.9x SLOWER than not batching at all. Full numbers and why:
`symbiote-perf-measurement`, "Batching the animation flush".

Measured (`reconcile.bench.ts`, 32 screens × 60 rows): 0.0179 ms → 0.0040 ms p75, 4.5x, and the
gap widens with app size because what it removes is the sibling scan.

**It falls back to `commitContainer` on anything it cannot prove, and the preconditions are the
whole design:**

- the node and every ancestor must already be committed;
- **`structureDirty` must be false on the node AND on every ancestor.** A committed record's
  `children` is a SNAPSHOT from the last commit. Rebuilding an ancestor's child set from that
  snapshot is exactly why this route is cheap, and exactly why a stale snapshot silently publishes
  the OLD structure — a row added since the last commit simply never reaches Fabric, with nothing
  red anywhere. An earlier version read `record.children` without this check and did precisely
  that.
- **Plan first, mutate second.** Every handle is resolved and every precondition checked before a
  single native call. An earlier version validated the chain up front but resolved sibling handles
  inside the clone loop, so a mid-loop bail had already re-pointed the node's committed record at a
  clone that never reached `completeRoot` and had already cleared its dirty flags — the fallback
  then skipped the node as clean and committed an orphan handle.

Both defects were found by `__tests__/animated-commit-cost.test.ts` and neither was visible to
`tsc`, to a value assertion, or to any other test in the suite. Its oracle row is the one that
generalises: **after a targeted commit, a general commit must do nothing** — zero clones, zero
`completeRoot`. The general path is the reference implementation, so the targeted one is correct
exactly when it leaves the reference nothing to find.

## 4. The commit — sync vs async is the adapter's choice

A `SymbioteSurface` (`core/engine/src/surface.ts`) is one mounted root. It holds
the top-level nodes and offers two commit strategies. **This is the single
biggest decision a renderer seam makes:**

```
surface.commit()         SYNCHRONOUS   commitChildren now.
                         React's react-reconciler calls this in resetAfterCommit
                         (it already batches per logical update). Tag exists the
                         moment a React effect runs.

surface.requestCommit()  COALESCED     queueMicrotask(() => commit()), de-duped.
                         Reactive frameworks (Vue, Svelte, zoneless Angular) emit
                         many mutations per tick; this collapses them to ONE
                         completeRoot at the microtask boundary. The Fabric tag is
                         assigned INSIDE that microtask — AFTER onMounted /
                         watch(flush:'post') has already run. ← root of §6/§7.
```

`commitChildren(rootTag, children)` (`commit.ts`) walks the tree via `reconcile`,
clones only changed nodes (each carries its last-committed props/childIds/tag in
the mirror), builds one childSet, and calls `completeRoot` — Fabric assigns fresh
tags atomically. **Clone-bubble:** if a leaf's props change, every ancestor
re-clones (a persistent parent holds specific child handles). This is intentional
and identical to React's own Fabric renderer; it means high-frequency updates to
deeply nested leaves are not free. Anchors (`createAnchor`) are filtered out of
the walk — they never reach Fabric.

## 4b. Per-tag host behavior — and why `removeChild` is NOT the destroy signal

`core/engine/src/host-behavior.ts` lets a primitive's state machine live on the engine node instead
of inside a framework component, which is the tier-2 half of
`.claude/rules/host-primitive-tier.md`. Two hooks, `attach(node)` at `createElement` and
`detach(node)` once the node is known to be gone. Both paths are gated on a module boolean, not on
the Map, because `createElement` runs ~9 000 times per benchmark create and an app that registers
nothing must pay one boolean read.

**The registry is forced, not chosen.** `@symbiote-native/components` depends on
`@symbiote-native/engine`, never the reverse, so the engine cannot import `createPressHandlers`
directly and CLAUDE.md's preferred "delete the indirection" is unavailable. Which walks straight
into the `inlineRequires` hazard: a module whose only job is to call `registerHostBehavior` is never
named as a value, so re-exporting it from a barrel means it never evaluates in a RELEASE build. The
adapter entry needs a bare `import '../register';` that is NOT re-exported — the
`packages/slider/src/{react,vue,svelte,angular}/index.ts` shape. `registerHostBehavior` `dlog`s so
`DEBUG=1` answers "did my registration run" before anyone debugs the behavior itself.

**The registry is keyed by INTRINSIC TAG and the node is not — this is the one thing that makes a
registration silently unreachable.** `node.component` is the resolved FABRIC view name: every
adapter runs the tag through `descriptorFor` before calling `createElement`, so `symbiote-view`
arrives as `RCTView`. Keying by Fabric name instead is not available — a pressable resolves to
`RCTView` like any other view, so the press machine would attach to every plain `View` in the app.
So the tag is passed as `createElement`'s third argument, the registry is read EXACTLY ONCE in
`attachHostBehavior`, and the behavior found there is stored in a `WeakMap<node, IHostBehavior>`
that every later path reads — teardown, re-attach, `ownsListener(node, name)`. Nothing is stored on
the node. Found by a peer probing the installed artifact after seven break-tested tests stayed
green: they built the subject as `createElement(PRESSABLE_TAG)`, which passes the tag AS the Fabric
name and matches by accident (`.claude/rules/test-harness-false-greens.md` §11).

**A behavior OWNS listener names, or the app evicts it.** `node.listeners` is a single-slot Map, and
`press`/`pressIn`/`pressOut` are base ViewConfig events while `startShouldSetResponder` /
`responderMove` are responder events on any node at all — so an app's own `onPress` lands on the
very keys the gesture starts on. `IHostBehavior.ownedListeners` makes `setEventListener` divert an
owned name into a per-node stash (`appListenerFor`) instead, leaving the behavior's dispatcher in
the slot; `setBehaviorListener` is the one writer allowed past that gate, because routing the
dispatcher through `routeProp` would stash the dispatcher itself. The component wrapper used to
mediate this by destructuring the app's callbacks before they reached the node — lowering removes
the mediator, and this replaces it.

**Dirtying is not publishing.** A behavior reacting to a NATIVE event runs outside every renderer
mutation path, so nothing schedules a commit: `native-events.ts` requests none and no adapter does
either. `setNodePressed` alone leaves the pressed style on the node and the unpressed one on the
screen. Pair it with `requestCommitFor(node)` (extracted from `setNativeProps`' tail, reusing the
same `pendingByRoot` + `queueMicrotask` batch). `setNodeHidden`'s React twin never hit this because
the reconciler is already in its commit phase when it calls.

**The rule this section exists for, stated before its two instances: the engine cannot infer
framework INTENT from a mutation.** Both times a teardown signal was picked here it was a genuine
engine-side fact that did not mean what it looked like — `removeChild` really is the only path that
unlinks a node, and a candidate really is still absent at the next commit. Neither fact is about
whether the FRAMEWORK is done with the node, and a framework is free to spell "move" or "park" with
the same mutations it spells "destroy". Expect a third instance; when one appears, the fix is to
make the engine-side action reversible (as `attach` was made re-runnable), never to look for a
smarter signal.

**The teardown timing is the part worth reading twice.** Engine-side, `removeChild` looks like the
destroy path and the reasoning is sound: `appendChild` and `insertBefore` both open with
`detach(child)`, so a reorder never lands there. It is still wrong, because a FRAMEWORK may spell a
move as remove-then-reinsert:

```
solid-js/universal/dist/universal.cjs:186   replaceNode = insertNode + removeNode
                                     :157   reconcileArrays calls it for a node that IS in the
                                            new array and is needed at a LATER index
                                     :130   the sibling call IS guarded by !map.has(...)
                   dist/universal.js:184 / :155 / :128   same three facts, ESM build
```

Cite the build, not just the line: the package ships both, and `.cjs` sits exactly two lines below
`.js` throughout. Two records of the same finding that name different numbers look like a
contradiction until someone re-reads both files.

One guarded call and one not, which is why a quick read of that file says "removeChild means gone".
Tearing down there kills the machine of a node that returns alive a few operations later in the same
batch — long-press stops working after certain list reorders, device-only, nothing red.

**And "still absent at the next commit" is not proof of death either — same lesson, second
adapter.** Svelte parks LIVE nodes offscreen across commits and sometimes across seconds:
`detachFromParent` in `adapters/svelte/src/dom-shim/shim-node.ts` moves a node into a
`DocumentFragment`, which has no engine node, so it calls `engineRemoveChild` AND `requestCommit`
while fully intending to bring the node back. Three Svelte-internal sites do it — a parked `{#if}`
branch, `each.js`'s `destroy_effects`, and worst, `boundary.js`'s `move_effect` while a `pending`
snippet shows, which returns only when async work resolves. The sweep therefore does tear down
nodes that come back, and the answer is not a cleverer sweep: `attach` is RE-RUNNABLE
(`reattachHostBehaviors`, called from `appendChild`/`insertBefore`), so the machine restarts rather
than surviving an arbitrary absence. A parked subtree is offscreen — nobody is mid-gesture in it —
and teardown staying unconditional means there is no leak mode, which an explicit "retain" API
would have had. The invariant is "a node in the tree has a live behavior", which is checkable.

The sweep marks EVERY node it walks in a `WeakSet`, not only those carrying a behavior: the node a
framework re-inserts is usually a plain container whose DESCENDANT holds the machine, so gating the
mark makes the re-attach walk skip entirely. A fresh tree never has a mark, so `appendChild` pays
one WeakSet miss on the ~9 000-call create path.

So removal only NOMINATES (`markDetachCandidate`) and the COMMIT sweeps
(`sweepDetachedBehaviors`, called from `commitContainer` before the walk and before both early
returns). Commit is not a heuristic or a deferred timer: mutations coalesce into one commit per
tick, so by then a node is either back under a parent or gone. The subtree walk lives in the sweep
rather than at removal — `removeChild` fires only for the subtree ROOT, so a nested Pressable inside
a removed row would otherwise keep its timer — and it is cheaper there, since only the nodes that
actually left are walked. A surface's top-level nodes carry `parent === undefined` by design, so the
sweep also checks the container's child list; the parent check alone would report a live one as gone.

Guarded by `core/engine/src/__tests__/host-behavior.test.ts`. The load-bearing case is "does NOT
tear down a node removed and reinserted in the same tick" — break-tested by moving teardown back
into `removeChild`, which fails it with `a reorder is not a removal: expected [ SymbioteNode ] to
deeply equal []`.

## 5. The imperative / native bridge — `core/engine/src/commit.ts`

The backdoor for focus/blur, measurement, Animated, gestures. Every one is
**gated on the committed record**: it does `committedOf(node)` and, if the node
hasn't committed — or if what it was handed is a wrapper rather than the node
itself, see §3 — **silently returns**, no throw.

```
dispatchViewCommand(node, name, args)    // e.g. TextInput focus, Switch setValue
measure(node, cb) / measureInWindow / measureLayout(node, relativeTo, ok, fail)
getNativeTag(node): number | undefined   // undefined ⇒ not committed yet
getNativeNode(node)
setNativeProps(node, partial)            // imperative prop write, bypasses the tree
sendAccessibilityEvent(node, type)
```

`DEBUG=1` surfaces the skip: `dispatchViewCommand "X" skipped: node not
committed` (and the `measure` / `setNativeProps` equivalents). That log means the
node has no tag at call time — either you're holding a Proxy (§3) or you called
too early (§6), not that the bridge is broken.

The ref-facing half of the same bridge — `measure` / `measureInWindow` /
`measureLayout` / `setNativeProps` / `focus` / `blur`, RN's
`ReactFabricHostComponent` — is **already on every node**, as prototype methods of
the `SymbioteNode` class in `node.ts`. `toPublicInstance` (`host-instance/`) is the
identity; it stays only because it names the seam each adapter calls. It used to
`Object.assign` six fresh closures onto each node, which cost 54 000 closures on a
1 000-row create and made GC the largest bucket in the profile — do not reintroduce
a per-node graft. `host-instance.test.ts` asserts `!Object.hasOwn(node, 'measure')`
precisely because every other test in that file passes either way.

This is why `node.ts` imports from `commit.ts` despite `commit.ts` importing
`node.ts`. The cycle is deliberate: neither side touches the other at
module-evaluation time, and installing the prototype from elsewhere at load time is
the registration-side-effect shape Metro's `inlineRequires` silently drops in
release builds.

## 6. `whenCommitted` — calling native before the tag exists

Under `requestCommit()` (§4), lifecycle code runs **before** the commit that
assigns the tag. A native call that reads the tag at mount and bails on
`undefined` with no retry is **dead on device** while the JS-path headless smoke
(which never needs a tag) stays green — the nastiest failure shape in the repo.

The fix is the engine primitive built on the post-commit seam
(`core/engine/src/post-commit.ts` — `registerPostCommit` / `runPostCommitHooks`,
fired after every `completeRoot` that assigned tags):

```ts
import { whenCommitted } from '@symbiote-native/engine';
// instead of:  dispatchViewCommand(node, 'focus', [])     // no-ops if tag not ready
const cancel = whenCommitted(node, () =>
  dispatchViewCommand(node, 'focus', []),
);
// run the action now if the node already has a tag, else after the commit that assigns it
onBeforeUnmount(() => cancel()); // drop the pending retry if we never commit
```

**Rule:** any native/imperative call wired at lifecycle time (`onMounted`,
`afterNextRender`, a node-ref-driven or `immediate` watch) on an async-committing
adapter MUST go through `whenCommitted`. A value-driven watch that only fires on a
LATER user change is safe (the node is committed by then). React skips this whole
class — it commits synchronously. Full diagnosis tree + the Vue/Angular specifics:
**`vue-adapter-reactivity`** (Gotcha 2) and **`angular-adapter`** §5.

## 7. Diagnostic logging — `dlog` / `isDebug` (`core/engine/src/debug.ts`)

All engine logging goes through `dlog`, never a bare `console.log`. Off by
default (one property read), on via `DEBUG=1` (Node / inlined into the canary
bundle) or `globalThis.__SYMBIOTE_DEBUG__ = true` (runtime). Output is prefixed
`[symbiote] `.

```ts
import { dlog, isDebug } from '@symbiote-native/engine';
dlog(`commit root=${rootTag} pre-completeRoot`); // gated, zero-cost when off
```

New code with non-trivial runtime behavior (a commit path, an event, a native
bring-up) should leave a `dlog` at its seam. Logs are an asset — only add, never
delete (`<keep_logs_gate_behind_DEBUG>`).

## 8. Gotchas for anyone driving the engine

1. **Route props through `routeProp`, not your own `onX` check** — the ViewConfig,
   not the key name, decides event-vs-prop (`onTintColor` is a prop). Re-splitting
   in the adapter both duplicates engine logic and gets the edge cases wrong.
2. **Hold nodes by identity** (§3). A reactive wrapper breaks every imperative
   command while the render path looks fine.
3. **Pick your commit strategy deliberately** (§4). Sync (`commit`) if your
   framework already batches (React); coalesced (`requestCommit`) if it emits many
   mutations per tick (Vue/Svelte/Angular).
4. **Async commit ⇒ `whenCommitted` for native calls** (§6). The headless smoke
   will NOT catch a missing tag — only a device/simulator does.
5. **Clone-bubble is real** (§4): a deep leaf update re-clones its ancestors.
6. **Anchors are tree-only** — no Fabric tag, no measure, no native effect.
7. **`getNativeTag` is your probe** — `undefined` when you expected a tag is always
   either §3 (Proxy) or §6 (too early). Log it first; don't theorize.
8. **Every commit — not just `setNativeProps` — sends `cloneNodeWithNewProps` a
   MINIMAL diff**, never the full flat prop set (`diffProps` in `commit.ts`); real
   Fabric merges that diff onto the native view's already-retained props, and a
   removed key arrives as literal `null` (reset to default), not absence. The
   shared test double (`core/test-utils/src/fake-fabric.ts`) mirrors this: its
   `cloneNodeWithNewProps`/`cloneNodeWithNewChildrenAndProps` MERGE the diff onto
   the previous fake node's props (keeping an explicit `null`, never deleting the
   key). If you assert a node's `.props` after a SECOND commit (an update, a
   targeted `setNativeProps`, a directive), read via `fabric.committed` (the
   latest clone), never `fabric.find`/`fabric.created` (only the original
   `createNode`'d object — it never reflects a later clone at all). Forgetting the
   merge fix here once silently dropped every unrelated prop on a second commit;
   caught only because a test asserted a sibling prop survived one.

## 10. Fabric's six BOOLEAN event gates — a dropped function prop kills the handler silently

Most Fabric events (scroll / touch / change) are emitted unconditionally by the native component.
Six are not: the C++ runs `if (props.onX)` before touching the event emitter, so a handler with no
matching boolean prop in the payload is dead. RN raises the flag with an `on*: true` entry in
`validAttributes`; `fabricProps` DROPS function props, so without an explicit flag the engine
attaches the listener on our side and native never emits. Nothing in a headless suite sees it —
the listener is present, the tree is right, and only a device shows nothing happening.

Measured 2026-08-23 against react-native 0.86, by grepping every `bool on*` field in
`ReactCommon/react/renderer/components/**`. The list is exhaustive:

```
gated_event_props := {                          # engine: GATED_EVENT_PROPS in node.ts
  layout               -> onLayout               BaseViewProps.h:103
  textLayout           -> onTextLayout           ParagraphShadowNode.cpp:351
  accessibilityTap     -> onAccessibilityTap     RCTViewComponentView.mm:1603
  magicTap             -> onMagicTap             RCTViewComponentView.mm:1613  # see name skew
  accessibilityEscape  -> onAccessibilityEscape  RCTViewComponentView.mm:1623
  accessibilityAction  -> onAccessibilityAction  RCTViewComponentView.mm:1633
}
not_gated := { onKeyPressSync, onChangeSync }   # iOS TextInput, RN sets them itself
```

`magicTap` is the one skew: the C++ member is `onAccessibilityMagicTap`, but RN's own view config
(`BaseViewConfig.ios.js:383`) declares `onMagicTap`. Upstream disagrees with itself; we match the
view config, because matching stock is the only defensible position until RN resolves it.

The flag is raised in `setEventListener` — the one place, so Svelte and Angular, which call it
directly, are covered along with the flat-bag adapters that reach it through `routeProp`.

`routeProp` needs no special case for these, and a guard consulting `GATED_EVENT_PROPS` there was
written and then deleted as dead: `view-config.ts`'s `BASE_EVENTS` already declares `layout` plus
all four accessibility events for EVERY component, and `TEXT_EVENTS` declares `textLayout` for
Text, so `isEventFor` is already true wherever a gate is meaningful. The only input the guard
changed was `onTextLayout` on a non-Text view, which is nonsense. What keeps the two lists in step
is a test, not a branch — `__tests__/gated-event-props.test.ts` drives every gate through
`routeProp` and fails if the ViewConfig stops declaring one.

**The flag follows the LISTENER, and the engine cannot tell a real subscriber from a forwarder.**
Angular's `Pressable`/`Button`/`TextInput` templates bind `(accessibilityTap)="emit(...)"`
unconditionally, so every instance now carries four dead flags — visible as a payload divergence
between Angular's flat and composed benchmark row shapes
(`adapters/angular/src/__tests__/benchmark-row-shape.test.ts`). That is adapter debt the gate fix
exposed, not a gate bug; an adapter that forwards an event eagerly is asking native to emit it.

### Why we are thinner than stock, and why that is not a bug

Stock RN sends ~6.9 payload keys per node on the benchmark row where we send ~3.6 (device-measured
2026-08-23, 62 001 vs 32 001 keys on Create-1000). Almost the whole difference is event MARKERS:
`ReactNativeAttributePayload` turns EVERY function prop into `true` for any key present in
`validAttributes`, and `BaseViewConfig.{ios,android}.js` list the entire responder family
(`onStartShouldSetResponder`, `onResponderGrant`, `onResponderMove`, …). Only the six above are
read by C++; the rest are inert, a legacy artefact of iOS ViewManager event declarations that RN
itself has a ticket to delete (`ViewConfigIgnore.js`, `TODO(T110872225)`). Style keys are NOT the
difference — the canary's CSS classes and bare-rn's `StyleSheet` entries were diffed
declaration-by-declaration and match exactly.

So "we send half the keys" is a genuine win on the create path, once the six real gates are sent.

## 9. One writer, or none — why a subtree cannot be shared with React's own renderer

Measured facts from the vendored sources (2026-08, RN 0.86 / React 19). Recorded because the
"can we bolt a block/fast-path optimizer onto STOCK react-native" question keeps coming back;
the answer for props differs from the answer for structure, and both are provable.

```
react_clones_from_its_own_reference := {
  where: ".vendors/react/packages/react-native-renderer/src/ReactFiberConfigFabric.js:451-497",
  code: "cloneInstance(): const node = instance.node; keepChildren ? cloneNodeWithNewProps(node, payload) : cloneNodeWithNewChildren(node)",
  consequence: "a SECOND writer's clones are invisible to React - it re-clones from its stale
    instance.node, and rebuilds children from its own fibers, so a foreign child set is erased",
  reachable_workaround: "patch fiber.stateNode.node up the whole ancestor chain, both alternates
    - i.e. reimplement the persistent commit from outside. NOT verified, NOT shippable",
  why_the_engine_exists: "we drive React in MUTATION mode, so the engine is the single writer and
    owns every clone - this is the mechanical reason, not a stylistic one",
}
setNativeProps_is_a_real_fabric_path := {
  where: "src/private/webapis/dom/nodes/ReactNativeElement.js:205 -> NativeDOM.setNativeProps",
  proof_of_support: "RN's own JS-driven Animated uses it per frame on a Fabric instance
    (src/private/animated/createAnimatedPropsHook.js:168-172)",
  documented_cost: "the fiber keeps the old props, so any React commit reverts the write; RN
    resyncs with a forced scheduleUpdate() on a 48ms debounce - '3 frames was the highest value
    where flickering was not observed' (same file, :178-190)",
  covers: "props on an existing host node (style/color/transform/opacity)",
  does_not_cover: "text (a <Text>'s content is a child RawText node - React exposes no ref to it)
    and any structure (children/list/condition), which hits the clone rule above",
}
```

Open, unmeasured: React's SHARE of a frame in our stack. Everything about whether a compiled
edit-list ("million-style blocks") is worth building hangs on it, and no number exists yet.
Instruments that give it directly: React's `<Profiler>` `actualDuration` (needs a profiling build
of React - stripped from release) and the Hermes sampling profiler in React Native DevTools.

## Reference

- Mutation API + node shape: `core/engine/src/node.ts` (read this first).
- The committed record (`IMirror`), its guarded accessor (`committedOf`), and the
  `dirty` / `propsDirty` pair: `core/engine/src/node.ts`.
- Clone-on-write commit, `commitChildren`, the imperative bridge, and
  `whenCommitted`: `core/engine/src/commit.ts`.
- Surface + commit strategies (`commit` / `requestCommit`): `core/engine/src/surface.ts`.
- Post-commit retry seam: `core/engine/src/post-commit.ts`.
- ViewConfig event inference (`isEventFor`): `core/engine/src/view-config.ts`.
- Diagnostic logging: `core/engine/src/debug.ts`.
- Public barrel (what `@symbiote-native/engine` exports): `core/engine/src/index.ts`.
- Reactive-adapter manifestations of §3/§6: the `vue-adapter-reactivity` and
  `angular-adapter` skills. Building a NEW adapter on this API: `symbiote-new-adapter`.
- §2's structural-adapter split (`setEventListener` called directly vs routed
  through `routeProp`) in practice: `angular-adapter-events` (`Renderer2.listen`'s
  anchor-transparency double-fire cause) and `svelte-adapter-dom-shim` (the
  custom-element codegen path).

Note: earlier revisions of this skill cited numbered ADRs under `.docs/decisions/`
(`0010` incremental clone-on-write, `0002` adapter seam + shared retained tree). That
tree is local-only (`.gitignore`: "hidden folders are local-only") and is NOT present
in a checkout, so those citations were unreadable. The live sources are the code paths
above plus the sibling skills; do not re-add an ADR path.
</content>
</invoke>
