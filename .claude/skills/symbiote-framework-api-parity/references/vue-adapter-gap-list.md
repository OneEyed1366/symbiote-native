# Vue adapter gap list (audited 2026-09-25, against vue-api-surface.md)

Method: per the React lesson this session already learned, every claim below is
backed by a real test against the engine, not inference from reading source.

## works (real-engine tested)

- `Teleport`: wired via a guarded wrapper (`create-portal/index.ts`) over Vue's own
  `Teleport`, same-surface-only, same shape as the React adapter's `createPortal`.
- `Suspense`: verified working with zero adapter-specific code, exactly as Vue's own
  docs claim (`__tests__/suspense.test.ts`, new 2026-09-25): fallback shows first,
  real content commits once the async `setup()` resolves.
- `KeepAlive`: verified preserving a cached child's state across a deactivate/
  reactivate toggle instead of destroying and recreating it (`__tests__/
  keep-alive.test.ts`, new 2026-09-25).
- `v-show`: has its own implementation (`runtime-helpers/index.ts`'s `vShow`), routes
  through `setNativeProps`/`whenCommitted` to the engine, not a DOM-shaped stub.
- `v-model` on `<text-input>` and `<switch>`: has its own `vModelText`
  implementation with real modifier support (`.trim`, `.number`; `.lazy` warns since
  there is only one native change stream to defer to). Handles the switch-vs-text
  value shape via `isSwitchNode`. `vModelCheckbox`/`vModelRadio`/`vModelSelect`/
  `vModelDynamic` are correctly absent: Vue's compiler always picks `vModelText` for
  a non-DOM-recognized element, so those four are dead paths for every one of our
  tags, not a real gap.
- `withModifiers`, `withKeys`, `useCssModule`: each has its own implementation
  (copied/adapted from `runtime-dom`'s logic, not DOM-dependent), covering
  `.stop`/`.prevent`/`.self`/system-key modifiers, `@keydown.enter`-style key
  filtering, and `<style module>` class lookup.

## found missing, then built or deferred

`Transition`, `TransitionGroup`, `useCssVars` did not exist anywhere in
`adapters/vue/src`: all three resolved to `undefined` through the Metro-rewritten
`'vue'` import path every app uses, exactly the class of bug `vModelText` had before
this adapter grew its own implementation (a `runtime-dom`-only export silently
missing from the `runtime-core` re-export `runtime-helpers/index.ts` does).

Depth check before deciding what to do about each:

- `useCssVars`: `core/css-parser/src/lightning/declarations.ts:12-18` and
  `rules.ts:246-249` confirm the CSS pipeline deliberately drops an unresolved
  `var()` with a warning today (`color: var(--from-other)` never ships to Fabric).
  A runtime-reactive variable, the entire point of `useCssVars`, a JS value driving a
  CSS custom property that changes over time, has no foundation at all: no
  style-registry concept of "this value can change and styles referencing it must
  re-resolve." Genuinely new capability, likely touching `core/css-parser` and
  `core/engine`'s style resolution, not adapter-local. The comment's own pointer to
  `.claude/rules/style-registry-collisions.md` is a dangling reference; that file
  does not exist anywhere in the repo or the user's global rules, the same class of
  staleness as `PortalDemo.tsx`'s dead skill reference found during the React pass.
- `Transition`/`TransitionGroup`: less green-field than it looked. `adapters/vue/src/
  modules/animated/` already existed (`create-animated-component.ts`, `index.ts`),
  mirroring the React adapter's own `modules/animated`. Vue's `BaseTransition`
  (already working, it lives in `runtime-core`) exposes a plain hook contract
  (`onBeforeEnter`/`onEnter`/`onLeave`/etc., JS callbacks, no CSS class assumptions
  baked in at that layer; that part is `Transition`'s own DOM-specific layer). So the
  real task was narrower than "build animation infrastructure from scratch": wire the
  hook contract to the engine's existing `AnimatedValue`.

Decided (2026-09-25): build `Transition`/`TransitionGroup` now, defer `useCssVars`
(dismissed by the user as low value, not a tracked TODO to revisit soon).

## Built: Transition / TransitionGroup

`adapters/vue/src/create-transition/index.ts`, exported from both the main barrel
(`@symbiote-native/vue`, direct import) and `runtime-helpers` (the Metro-rewritten
`'vue'` import every app uses). Wires `BaseTransition`'s (`Transition`) and
`resolveTransitionHooks`/`setTransitionHooks`/`getTransitionRawChildren`
(`TransitionGroup`, same low-level primitives Vue's own `runtime-dom` implementation
uses) enter/leave hook contract to an opacity fade driven by the engine's
`AnimatedValue`/`timing`.

Two real bugs found and fixed while writing the ground-truth tests
(`__tests__/transition.test.ts`), not caught by typecheck:

1. First attempt used `setNativeProps` to write the animated opacity, mirroring
   `vShow`'s pattern. Wrong primitive: an `AnimatedNode` is only recognized and kept
   subscribed to per-frame updates through `routeProp`'s own resolution
   (`core/engine/src/animated/host-binding.ts`), which `setNativeProps` bypasses
   entirely. Fixed by reading the current style via `propOf`, merging in the
   `AnimatedValue`, and writing it back through `routeProp` (matching
   `renderer/index.ts`'s own `patchProp` implementation) plus `requestCommitFor`.
2. A leave-transition test asserted the opacity had started dropping one macrotask
   tick after triggering the leave; it read `1` (unchanged) because the animation's
   first `requestAnimationFrame` frame is itself scheduled via `setTimeout` in the
   test's rAF polyfill, racing a same-delay `setTimeout` in the test's own tick
   helper. Not a real defect, a fake-timer ordering issue; fixed by waiting a real
   20ms instead of one microtask-adjacent tick.

Known simplification, documented rather than silently shipped: no named
per-`name` enter/leave effects (Vue's CSS-class convention), always a plain opacity
fade with a `duration` prop. `TransitionGroup`'s move/reorder FLIP animation (Vue's
own implementation measures `offsetLeft`/`offsetTop`, DOM-specific) is not
implemented; reordering commits instantly with no animated shift.

## Deferred: useCssVars

Not built. CSS pipeline (`core/css-parser/src/lightning/declarations.ts:12-18`,
`rules.ts:246-249`) deliberately drops a runtime-reactive `var()` today; there is no
foundation to bind a JS reactive value to a CSS custom property at all. The user
dismissed this as low value without a clear use case, not merely "later" but
effectively out of scope for this initiative unless a concrete need surfaces.

## Remaining surface, swept and confirmed working (2026-09-25)

`__tests__/remaining-api-surface.test.ts`, all real-engine, all green with zero
adapter changes needed:

- `useTemplateRef`: binds to the real committed host node via a matching
  `ref="name"` template ref.
- `useId`: returns a stable id, identical across a component's re-renders.
- `useModel`: reads the bound prop and emits `update:<name>` correctly.
- `onActivated`/`onDeactivated`: fire in the right order around a `KeepAlive`
  toggle, confirming the already-verified `KeepAlive` also gets these hooks right.
- `resolveDynamicComponent`/`<component :is>`: resolves a component reference.
- `v-memo`: not adapter-testable in isolation, it lowers to a patchFlag and memo-array
  comparison inside `@vue/compiler-core`'s generated render function, no
  runtime-core/runtime-dom export exists to exercise outside a compiled template.
  No adapter dependency, so no adapter gap either.
- A generic custom directive via `withDirectives` (`mounted`/`updated`/`unmounted`
  hooks, not just the two special-cased ones `v-show`/`v-model` already had): fires
  in the right order with the right values on a plain host node.

`watchPostEffect`/`watchSyncEffect` flush-timing: now verified
(`__tests__/watch-flush-timing.test.ts`, new 2026-09-25). `watchPostEffect`'s
callback sees the committed tree already reflecting the new value; `watchSyncEffect`
fires synchronously on the change, before Vue's own batched render flush, both
correct against this renderer's own commit cycle, not just against a browser DOM.

`<script setup>` macros through the REAL compiler (not just hand-built `h()` calls):
already has real, working precedent in this suite
(`host-ref-not-reactive.test.ts`, pre-existing), which compiles and mounts a real
`<script setup lang="ts">` SFC via the actual `metro-vue-transformer.cjs`'s
`compileSfc`, proving the general claim ("SFC macros are compile-time only, work as
long as the pipeline uses the real compiler") rather than merely assuming it.
`defineModel` specifically reduces to `useModel` at the compiler level (already
verified directly), so a dedicated SFC test for it would re-prove two already-proven
facts rather than surface new information; not written for that reason, not because
it was skipped.

## App API surface, swept and confirmed working (2026-09-25)

Real Vue apps lean heavily on the `App` instance `createApp` returns
(`app.component`/`app.directive`/`app.provide`/plugin `app.use`), which no earlier
test in this suite exercised directly. `render.ts`'s `setAppConfigurator` is exactly
the seam a real app would use this through (`render.ts:91-104`, already documented
inline as mirroring real Vue's `createApp(...).use(...)` pattern). Verified
(`__tests__/app-api.test.ts`, new 2026-09-25):

- `app.component(name, X)` plus `resolveComponent(name)`: resolves a globally
  registered component by its registered string name.
- `app.directive(name, X)` plus `resolveDirective(name)`: resolves a globally
  registered custom directive the same way.
- `app.provide(key, value)` plus `inject(key)`: reaches a descendant component.

Also verified (`__tests__/slots.test.ts`): named slots and scoped slots (a slot
function receiving scope data as an argument) both render correctly.

One test-construction mistake worth recording so it is not repeated: `withMemo`
(the internal primitive `v-memo` compiles to) needs a real, persistent
per-component-instance `_cache` array to mean anything; hand-calling it with a fresh
object literal every render is not a test of the adapter, it is a test of a cache
that was never wired up. Not re-attempted, matches the earlier conclusion that
`v-memo` has no meaningful way to test outside a compiled template.

## Vue pass: closed (2026-09-25)

Every item from `vue-api-surface.md` is now `works` or a documented, decided
deferral (`useCssVars`). Next: Solid, per the agreed adapter order.
