---
paths:
  - 'adapters/*/src/modules/animated/**'
  - 'core/engine/src/animated/leaf-lifecycle.ts'
---

# The AnimatedProps leaf lifecycle is the ENGINE's - do not re-derive it per adapter

`createAnimatedLeafLifecycle` (`core/engine/src/animated/leaf-lifecycle.ts`) owns build/swap/bind/
detach, native event rebinding, and the rebuild-vs-skip decision. An adapter supplies ONLY two
things: **when** to reconcile (a `useEffect` / `onUpdated` / `ngOnChanges` / `$effect`) and **how**
to resolve the host node. Angular adds one more, `whenCommitted`, because its batched zoneless CD
has no committed Fabric tag at `ngAfterViewInit`.

This policy lived four times until 2026-08-16 and drifted: only Svelte ever grew the guard, after a
day of device debugging. The other three each had something that LOOKS like the same check and is
not - React's `useMemo(..., [rest])` (its dependency is a fresh rest-destructured object every
render), Vue's `pendingLeaf === null` ("has render run yet", not "did anything change"), Angular
nothing. Adding a fifth copy, or "just a small local guard", re-opens exactly that.

## Two things about the guard that are load-bearing, not defensive

**Compare against a stored SNAPSHOT, never the caller's object.** A caller may hand back the SAME
object every update and mutate what its keys resolve to - Svelte's rest proxy does exactly this,
device-confirmed. Storing the reference makes the next call compare it with itself, read the same
current values through both sides, and conclude nothing changed, permanently. The rebuild is then
skipped forever and a rebuilt interpolation never reaches the native graph: on device, a sticky
header that ignores scrolling entirely.

**The skip is gated on the leaf ALREADY being native, and that gate points the other way.** Before
the first native connection reconcile must run on every call - that cadence is what wires a rebuilt
interpolation into the shared value's children (`AnimatedInterpolation.__attach` ->
`parent.__addChild`). Skip there and the fresh node is stranded, its listener never fires, and the
debounce that would promote the chain to native never settles.

**Only the NATIVE half is deferrable.** `scheduleNativeBind` moves `setNativeView` /
`__makeNative` / event attach to a moment the caller picks (Angular: `whenCommitted`). The leaf
build and its `__attach()` into the value graph must stay synchronous - a deferred build sits
behind a canceller the next reconcile drops, so a component reconciling faster than it commits
attaches nothing at all. Regression-covered in
`adapters/angular/src/modules/animated/leaf-attach-before-commit.test.ts`.

The first two are pinned in `core/engine/src/animated/leaf-lifecycle.test.ts`. If a change makes one of those
tests awkward, the change is wrong.

## Reference stability is the caller's half of the contract

The guard can only skip if the props it is handed are reference-stable across ticks that changed
nothing. An inline object/array/function literal in a template, or a getter that rebuilds one per
change-detection pass, defeats it silently - see `angular-adapter-change-detection` §3 (takeaway 2)
for the Angular form of this, and `sticky-header.svelte`'s split of `animatedStyle` out of its
props bag for the Svelte one.
