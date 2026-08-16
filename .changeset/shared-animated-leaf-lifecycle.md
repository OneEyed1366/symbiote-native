---
'@symbiote-native/engine': minor
'@symbiote-native/angular': patch
'@symbiote-native/react': patch
'@symbiote-native/svelte': patch
'@symbiote-native/vue': patch
---

Move the AnimatedProps leaf lifecycle into the engine, where it should always have lived. Building
a leaf from the current props, swapping it into the value graph new-before-old, binding it to the
committed node, going native, rebinding native event props - none of that is framework-specific,
and yet it was written four times, once per adapter. They drifted, which is the whole reason this
is a changeset and not a refactor.

Only the Svelte copy ever grew a rebuild guard, after a day of on-device debugging: without it,
every scroll-driven passthrough tick tore down and reconnected a brand-new native node even though
nothing animated-relevant had changed, and a reconnect landing exactly when scrolling stopped left
the view frozen at its post-reset default. The other three copies each look like they have an
equivalent and do not. React's `useMemo(() => new AnimatedProps(rest), [rest])` reads like the same
reference check but never was one - `rest` comes out of a rest-destructure, so the dependency is a
fresh object on every render. Vue's `pendingLeaf === null` answers "has render run yet", not "did
anything change". Angular had nothing at all.

New engine export `createAnimatedLeafLifecycle(label)`. All four adapters now drive it and supply
only what is genuinely theirs: WHEN to reconcile (an effect, `onUpdated`, `ngOnChanges`, a
`$effect`) and HOW to resolve the host node. Angular additionally keeps its `whenCommitted`
deferral, which its batched zoneless change detection requires.

The guard compares props per key by IDENTITY against a stored SNAPSHOT, never against the caller's
own object. That distinction is load-bearing rather than defensive: a caller may legitimately hand
back the same object every update and mutate what its keys resolve to (Svelte's rest proxy does
exactly this), so storing the reference would compare it with itself, read the same current values
through both sides, and conclude nothing ever changes. The rebuild would then be skipped forever
and a rebuilt interpolation would never reach the native graph - on device, a sticky header that
ignores scrolling entirely.

It is also gated on the leaf already being native, and that gate points the other way: before the
first native connection reconcile must run on every call, because that cadence is what wires a
rebuilt interpolation into the shared value's children. Skipping there strands the new node, its
listener never fires, and the debounce that would have promoted the chain to native never settles.

Only the NATIVE half of a reconcile is deferrable, via an optional `scheduleNativeBind` callback -
Angular passes `bind => whenCommitted(node, bind)` because its batched zoneless change detection has
no committed Fabric tag at `ngAfterViewInit`. Building the leaf and attaching it to the value graph
is always synchronous, and that split is load-bearing rather than tidy: a deferred build sits behind
a canceller the next reconcile drops, so a component reconciling faster than it commits attaches
nothing at all and a sticky header's rebuilt interpolation never reaches the graph.

Behavior is unchanged for React, Vue and Svelte beyond the guard the first two never had. No public
component API moves.
