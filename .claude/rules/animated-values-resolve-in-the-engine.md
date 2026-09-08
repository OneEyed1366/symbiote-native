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
| 15 | **`Animated.event` native attach/detach** | **GAP — still wrapper-only** |
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
