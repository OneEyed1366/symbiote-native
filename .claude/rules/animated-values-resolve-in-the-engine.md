# An animated value in a prop is the ENGINE's job — `createAnimatedComponent` has none left

Landed 2026-09-07 in `core/engine/src/animated/host-binding.ts`. An app writes

```
<view style={{ opacity: someAnimatedValue }} />
```

on a bare intrinsic tag, and `routeProp` publishes the current value, subscribes an `AnimatedProps`
leaf, writes each frame through the engine's own targeted `setNativeProps` commit, and releases the
subscription at the commit sweep. No wrapper anywhere.

This is why it was always the wrong layer: the two halves the wrapper brokered — the value graph
and the node's Fabric view tag — were already engine-side (`animated/props.ts`, `commit.ts`'s
`getNativeTag`). The wrapper stood between two things in the same room, and it could only exist at
all while a primitive was a COMPONENT to wrap.

## The seam, in four lines

```
routeProp        one call to bindAnimatedValue, gated on hasAnimatedNodes() (graph.ts)
                 -> publishes the rasterized value; every branch below it sees a plain value
sweepDetached-   takes an onDetached callback, run per node of a genuinely-removed subtree
  Behaviors      (commit.ts passes detachAnimatedProps)
appendChild /    reattachAnimatedProps re-arms a parked subtree Svelte brought back
  insertBefore
```

Two gates keep it free for an app that animates nothing: `hasAnimatedNodes()` (no `AnimatedNode`
has ever been constructed — one boolean, read on every prop write) and `hasAnimatedBindings()` (no
node has ever bound one — read on `removeChild` and the two inserts).

## `createAnimatedComponent`'s job, and where each half now lives

Enumerated from RN's own `createAnimatedComponent.js` + `createAnimatedPropsHook.js`, plus our
React, Vue and Angular ports. **This is the list the adapter-deletion pass is scoped against.**

| # | Job | Now |
|---|---|---|
| 1 | Build an `AnimatedProps` leaf from the current props | engine |
| 2 | Attach/detach it to the value graph, NEW BEFORE OLD | engine (`leaf-lifecycle`) |
| 3 | Rebuild-vs-skip on re-render | engine (`leaf-lifecycle`) |
| 4 | Reduce animated props to concrete values for the first paint | engine (`rasterize`) |
| 5 | The flattened style walk — object, array, `transform` entries | engine (`AnimatedStyle.from`) |
| 6 | Per-frame `setNativeProps` that bypasses a re-render | engine (`AnimatedProps.update`) |
| 7 | `collapsable: false` so Fabric keeps a view to bind to | engine |
| 8 | Bind the leaf to the host view (`setNativeView`) | engine |
| 9 | Native attach `connectAnimatedNodeToView(propsTag, viewTag)` | engine (by CASCADE) |
| 10 | Native detach `restoreDefaultValues` + `disconnectAnimatedNodeFromView` | engine |
| 11 | Teardown on unmount | engine (commit sweep) — plus re-arm on re-insert, which no wrapper had |
| 12 | Ref forwarding / `useMergeRefs` | N/A — the app's ref IS the engine node |
| 13 | `getScrollableNode` unwrap (`resolveHostNode`) | N/A — `routeProp` already holds the node |
| 14 | `displayName` | N/A |
| 15 | `Animated.event` native attach/detach | engine (`bindAnimatedEvent`) — **the GAP recorded here was already closed when it was written** |
| 16 | **`passthroughAnimatedPropExplicitValues`** | **GAP for an app; the one in-repo consumer (sticky headers) is already a behavior** |
| 17 | `scheduleUpdate` / the 48 ms Fiber↔ShadowTree resync | N/A by design — we write `node.props`, there is no second tree |
| 18 | `onUserDrivenAnimationEnded` re-pull | not covered, and no adapter covers it either |
| 19 | `AnimatedValue` listener registration for native values | N/A — `AnimatedValue.__makeNative` streams when listeners exist |
| 20 | The `unstable_*` allowlist | N/A, never ported |

A fourth, smaller gap: only `style` is walked for nested nodes. An AnimatedNode inside an
`activeStyle` prop is not resolved.

## Two things that must not be re-derived

**`wantsNative` was a wrapper-ism.** The wrapper forced `__makeNative()` when
`passthroughAnimatedPropExplicitValues` was set. The engine forces nothing: a leaf goes native by
CASCADE from the value it is a child of (`AnimatedWithChildren.__addChild` /
`__connectNativeChildren`), so `useNativeDriver` on the animation is the only thing that decides —
in both orders (animation before mount, mount before animation).

**No `scheduleNativeBind` deferral, though a prop write always precedes the node's first commit.**
Nothing the bind does needs a Fabric tag on the spot: `setNativeView` only stores the target,
`connectToView` defers itself through `pendingViewConnects` + the post-commit hook, and
`attachNativeEventHandler` wraps its own `whenCommitted`. A deferral here was written, found
unfalsifiable, and removed.

## Row 15 was recorded as a GAP and was never one — check a table's own file before quoting it

Corrected 2026-09-10, while pricing the deletion of Svelte's ScrollView wrapper. Row 15 said
`Animated.event` native attach was "still wrapper-only", which made `Animated.ScrollView` look like
the one member of the namespace with a real job. `bindAnimatedEvent` is called from `setEventListener`
(`core/engine/src/node.ts`, under `if (hasAnimatedNodes())`) for ANY `on*` prop on ANY node, and
`host-binding.ts` carries its `reattachAnimatedEvents` re-arm beside the value one. Both were in this
file's own subject when the row was written.

Two things generalise, and they are this repo's own rules pointed at a table rather than at a comment:

- **A row saying GAP is a claim about code, and it decays like any other.** The rest of the table was
  re-derived when the wrapper was deleted; this row was inherited. `command grep -rn "bindAnimatedEvent" core/engine/src`
  is the whole check and it is one line.
- **A stale GAP scopes work DOWN and nothing ever fails.** Believing it, the honest conclusion was
  "a scroll wrapper must survive for `Animated.event`" — a wrapper kept, a feature not shipped, and
  no test anywhere to contradict it. That is the same asymmetry `adapter-parity-audit.md` records for
  an impossibility claim: a wrong "already done" costs a read, a wrong "still open" costs the repair.

## A full commit DURING a fade transiently drops the animated key — OPEN, unverified on device

Measured 2026-09-10 while instrumenting `touchable-opacity`'s press-in, three arms (no style,
`{width:40}`, `{opacity:0.6}`), reading the COMMITTED payload with no await after the touch:

```
[nostyle] at rest   committed.opacity=1      props.style={"opacity":1}
[nostyle] pressed*  committed.opacity=null   props.style={"opacity":0.2}
[faded]   pressed*  committed.opacity=0.6    props.style={"opacity":0.2}   stale, not null
```

The animated value lands on the node synchronously (`OPACITY_ACTIVE_GRANT_DURATION_MS` is 0, so the
timing sets it inside `.start()`). What lags is the PAYLOAD: the fade publishes through
`setNativeProps`, whose flush is a microtask away, so a full `commitContainer` landing in between
commits the pre-press value — `null` where the author gave no `opacity`, the stale resting value
where they did. On device that predicts a one-frame flash to full opacity at press-in. Not
reproduced on a device; nobody has looked.

**The test-harness half is the part that has already cost time.** A suite reading the committed
node with no `await flushFrames()` after a touch reads the pre-press value, so a press assertion can
fail for a reason that has nothing to do with the behavior. That was reported once as an adapter
divergence correlated with carrying a `style` prop; the real discriminator is whether the test
awaits frames. Before blaming a fade, add the await and re-read.
