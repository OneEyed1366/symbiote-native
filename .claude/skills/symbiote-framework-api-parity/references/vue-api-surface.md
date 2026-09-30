# Vue public API surface (Vue 3.5.26, `.vendors/vue`)

Source of truth: `.vendors/vue/packages/runtime-core/src/index.ts` (framework-agnostic
exports, what a custom renderer inherits for free) and
`.vendors/vue/packages/runtime-dom/src/index.ts` (DOM-only exports, explicitly marked
as such in the file's own comments: `// DOM-only components`, `// **Internal** DOM-only
runtime directive helpers`). Scope: `vue` core only, Vue Router/Pinia excluded per
decision. `<script setup>` SFC macros are compile-time only (handled by
`@vue/compiler-sfc`), listed for completeness but not a renderer concern.

Category tags: same convention as `react-api-surface.md`.
`[core-reconciler-relevant]` touches mount/update/unmount, refs, host tree, or the
renderer's own node ops. `[pure-userland]` is reactivity/logic only, works once the
renderer runs at all. `[dom-specific]` is explicitly a `runtime-dom` DOM-only export
with no meaning off a browser DOM; needs a SymbioteNative-native equivalent, not a
straight import.

## Reactivity core (from `@vue/reactivity`, re-exported by `runtime-core`)

`reactive`, `ref`, `readonly`, `shallowRef`, `shallowReactive`, `shallowReadonly`,
`computed`, `unref`, `proxyRefs`, `isRef`, `toRef`, `toValue`, `toRefs`, `isProxy`,
`isReactive`, `isReadonly`, `isShallow`, `customRef`, `triggerRef`, `markRaw`, `toRaw`,
`effect`, `stop`, `getCurrentWatcher` (3.5+), `onWatcherCleanup` (3.5+),
`ReactiveEffect`, `effectScope`, `EffectScope`, `getCurrentScope`, `onScopeDispose`.
All tagged [pure-userland]: pure JS reactivity, no dependency on how the renderer
works.

## Watchers

`watch`, `watchEffect`, `watchPostEffect`, `watchSyncEffect`. Tagged [pure-userland],
though `flush: 'post'` timing depends on the renderer's own commit/patch cycle
completing (the point at which "post" fires), so worth a real test rather than an
assumption.

## Lifecycle hooks

`onBeforeMount`, `onMounted`, `onBeforeUpdate`, `onUpdated`, `onBeforeUnmount`,
`onUnmounted`, `onActivated`, `onDeactivated` (the last two are `KeepAlive`-specific),
`onRenderTracked`, `onRenderTriggered` (dev-only reactivity debugging),
`onErrorCaptured`, `onServerPrefetch` (SSR-only, N/A). All tagged
[core-reconciler-relevant]: they fire at real mount/patch/unmount boundaries the
renderer defines via `createRenderer`'s node ops, so their firing order/timing is a
direct renderer correctness question, not assumed-safe userland.

## Dependency injection, model, template refs

`provide`, `inject`, `hasInjectionContext`: tagged [pure-userland], component-tree
scoped, no host dependency. `useModel` (2-way binding helper for a component's own
prop, distinct from `defineModel` the SFC macro): tagged [pure-userland].
`useTemplateRef` (3.5+) and the legacy `ref="x"` template-ref binding: tagged
[core-reconciler-relevant], depends on the renderer correctly calling the ref-setting
mechanism (`setRef` in `runtime-core/src/rendererTemplateRef.ts`) against a real
mounted instance. `useId` (3.5+): tagged [pure-userland], SSR-hydration-safe id
generation, works off component tree position only.

## `<script setup>` compile-time macros

`defineProps`, `defineEmits`, `defineExpose`, `defineOptions`, `defineSlots`,
`defineModel`, `withDefaults`. Pure compile-time syntax sugar erased by
`@vue/compiler-sfc` before the renderer ever sees generated code: tagged
[pure-userland], not a renderer concern at all, as long as the SFC pipeline (this
repo's Vue-SFC Metro transformer) uses the same compiler.

## Advanced render function API

`getCurrentInstance`, `h`, `createVNode`, `cloneVNode`, `mergeProps`, `isVNode`,
`Fragment`, `Text`, `Comment`, `Static` (VNode types), `withDirectives` (custom
directive application), `resolveComponent`/`resolveDirective`/`resolveDynamicComponent`
(template-compiler helpers for dynamically-named components/directives). All tagged
[core-reconciler-relevant]: direct renderer/vnode mechanics.

## Built-in components (framework-agnostic, `runtime-core`)

- `Teleport`: renders children into a different part of the tree while keeping Vue's
  component context. Tagged [core-reconciler-relevant], needs the renderer to support
  moving/mounting nodes into an arbitrary target, analogous to React's `createPortal`.
- `Suspense`: async-dependency boundary, shows a fallback until nested
  `async setup()`/`<script setup>` top-level `await` resolves. Tagged
  [core-reconciler-relevant], but renderer-agnostic in Vue's own design: unlike
  React's Suspense, Vue's Suspense needs no special host-config hooks, it is
  implemented entirely in `runtime-core` over the ordinary node ops. Strong candidate
  to already work once the renderer's patch/mount ops are correct. Verify with a real
  test, not an assumption (matches the React lesson this session already learned).
- `KeepAlive`: caches a component instance instead of destroying it on toggle,
  preserving state, paired with `onActivated`/`onDeactivated`. Tagged
  [core-reconciler-relevant], needs the renderer's node ops to support
  detaching-without-unmounting and reattaching a cached instance's host nodes,
  analogous to React's `Activity`.
- `BaseTransition`: the framework-agnostic transition-hook primitive `Transition`/
  `TransitionGroup` are built on (enter/leave hook sequencing, no CSS/DOM assumptions
  baked in at this layer). Tagged [core-reconciler-relevant].

## DOM-only surface (`runtime-dom`, explicitly marked in Vue's own source)

- `Transition`, `TransitionGroup`: built on `BaseTransition` but wire CSS
  class-toggling and DOM transition/animation events. Tagged [dom-specific], needs a
  SymbioteNative-native equivalent (RN `Animated`/`LayoutAnimation`), not reusable
  as-is.
- `vShow`: toggles `display: none` via direct style mutation, bypassing v-if's
  create/destroy. Tagged [dom-specific] as shipped, but conceptually maps directly
  onto this project's own `setNodeHidden` (the same primitive `hideInstance`/
  `unhideInstance` use in the React adapter for `Activity`). Check whether the Vue
  adapter already routes `v-show` there or reimplements it.
- `vModelText`/`vModelCheckbox`/`vModelRadio`/`vModelSelect`/`vModelDynamic`:
  `v-model`'s actual two-way-binding runtime directives, DOM-input-shaped
  (`<input type=checkbox>` vs `<select>` are different directive objects). Tagged
  [dom-specific], needs SymbioteNative equivalents bound to `TextInput`/`Switch`/
  native picker primitives, not a direct port.
- `withModifiers`, `withKeys`: event-modifier helpers (`.stop`, `.prevent`, `.enter`,
  `.esc`...). Tagged [dom-specific]: `.prevent`/`.stop` are meaningless off a DOM
  event object, `.enter`/`.esc`/arrow-key modifiers need a native keyboard-event
  equivalent (RN's key event support is limited to certain platforms/components
  already). `withKeys`'s literal keycode set is DOM `KeyboardEvent.key`-shaped, not
  RN's.
- `defineCustomElement`, `defineSSRCustomElement`, `useShadowRoot`, `useHost`,
  `VueElement`: Web Components integration. Tagged [dom-specific], no meaning off a
  browser, legitimately N/A for a native renderer, not worth chasing.
- `useCssModule`, `useCssVars`: SFC `<style module>` lookup and CSS custom-property
  binding. Tagged [dom-specific] as shipped (`useCssVars` literally sets inline
  `--variable` on the DOM root), but this project's own CSS pipeline
  (`@symbiote-native/css-parser`, `StyleShowcaseScreen`) already reimplements
  `<style module>`/scoped CSS resolution independently of Vue's own DOM-bound
  composable. Check whether a `useCssVars`-equivalent dynamic-CSS-variable binding is
  covered by that pipeline rather than expecting Vue's own export to work unmodified.

## Custom Renderer API (what this adapter actually consumes)

`createRenderer(options)`: the entry point every non-DOM Vue renderer uses
(`nodeOps` + `patchProp`), matching this project's own
`adapters/vue/src/renderer/{nodeOps,patchProp}.ts` shape (per CLAUDE.md, mirrored from
`wolf-tui/packages/vue/src/renderer`). `createHydrationRenderer`: SSR hydration
variant, N/A (no server-rendered markup in a native app).

## Template syntax and directives (compiler-level, not a runtime export list)

`v-if`/`v-else-if`/`v-else`, `v-for` (plus `:key`), `v-bind`/`:`, `v-on`/`@`,
`v-model`, `v-slot`/`#`, `v-show`, `v-html` (tagged [dom-specific]: raw HTML
injection, no native equivalent, same status as React's `dangerouslySetInnerHTML`),
`v-text`, `v-once`, `v-memo`, `v-pre`, `v-cloak` (tagged [dom-specific]:
FOUC-prevention CSS hook, meaningless off a browser paint model), `v-is`/`is`
attribute for dynamic components, `<component :is>`, `<template>` (directive-only
placeholder, no host node emitted), `<slot>` (named/scoped slots). Compiler-emitted
render-function calls (`resolveComponent`, `renderList`, `renderSlot`,
`withMemo`/`isMemoSame`, `createSlots`, `toHandlers`) are tagged
[core-reconciler-relevant] via the same advanced render-function API above.
