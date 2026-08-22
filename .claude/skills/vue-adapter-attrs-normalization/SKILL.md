---
name: vue-adapter-attrs-normalization
description: "Symbiote Vue adapter/package attrs kebab-to-camel normalization — read BEFORE writing or porting any Vue lifecycle component (adapters/vue/src/**, or a new packages/*/src/vue/*.ts config-object component like Stack/Tab/Drawer) that reads options off the setup context's raw `attrs`. Use when a kebab-case-authored SFC template prop (`drawer-position=\"right\"`, `:screen-options=\"...\"`) is silently ignored / falls back to its default, or when porting a new Vue component and deciding how it should read multi-word option props. Root cause: Vue's compiler does NOT camelCase $attrs — it only camelCases DECLARED `props`, and this codebase's components deliberately never declare formal `props` schemas, so every one of them must manually normalize via `normalizeVueAttrs` at entry."
---

# Symbiote Vue adapter — attrs kebab→camel normalization

## The bug shape

A `.vue` SFC template author writes idiomatic kebab-case:

```html
<Drawer drawer-position="right" drawer-type="slide" :drawer-style="drawerStyle">
```

Vue's compiler does **not** camelCase this into the vnode's props/attrs object — it
compiles to the literal string key `"drawer-position"`, unchanged. Confirmed empirically
by compiling a minimal SFC through `adapters/vue/metro-vue-transformer.cjs`'s `compileSfc`
and reading the generated codegen: `{ "drawer-position": "right", ... }`.

Vue's automatic camelCase normalization (the reason kebab-case template authoring usually
"just works") only applies to **declared** `props` (`defineComponent({ props: {...} })`).
Every component in this codebase's Vue adapter deliberately reads everything through the
raw `attrs` object instead of declaring formal props — so if a component reads
`rawAttrs.drawerPosition` directly, that read is `undefined` for a kebab-authored template,
and the option silently falls back to its default. No error, no warning — just wrong
behavior (e.g. a drawer opening on the default LEFT edge instead of the RIGHT one
explicitly requested).

Raw-TSX/JSX authoring of the same component (`examples/vue-tsx`, `@vue/babel-plugin-jsx`)
does **not** trigger this, because JSX is naturally camelCase (`drawerPosition="right"`) —
that's a coincidence, not a safety net. A fix must handle both authoring styles.

## The established fix: `normalizeVueAttrs`

`adapters/vue/src/utils/normalize-attrs.ts` exports `normalizeVueAttrs(attrs)` — folds every
kebab-case key to camelCase (except `aria-*`/`data-*`, which must stay kebab). It is a
no-op / identity-preserving pass-through when nothing needs converting (the already-camel /
TSX path), so it's always safe to call unconditionally.

**Every** primitive component under `adapters/vue/src/components/**` and
`adapters/vue/src/modules/**` calls it immediately after destructuring attrs:

```ts
const DrawerImpl = defineComponent<IDrawerProps>(
  (_props, { attrs: rawAttrs, slots, expose }) => {
    const attrs = normalizeVueAttrs(rawAttrs);
    // read every multi-word option off `attrs`, never `rawAttrs`, from here on
    const drawerPosition = asDrawerPosition(attrs.drawerPosition);
    ...
```

This is a **codebase-wide, load-bearing convention** — not incidental, not optional. Import
it from `@symbiote-native/vue` (it's re-exported from the package root specifically so other
packages can use it, per `adapters/vue/src/index.ts`'s own comment: "Exported so an
[external package] can [apply the same fold]"). `normalizeVueAttrs` only folds key casing —
it does not classify a key as event-vs-prop; a normalized `attrs.onX`-shaped key still goes
through the emits/passthrough decision covered by `vue-adapter-events`, and once resolved to
a prop it flows into the engine's `routeProp` (`symbiote-engine-core`) for the actual
prop-vs-event split against the ViewConfig.

## The 2026-07 incident

```
§incident_2026_07_navigation_attrs := {
  bug: "packages/navigation/src/vue/{stack,tabs,drawer}.ts ported without normalizeVueAttrs",
  root_cause: "read rawAttrs.drawerPosition / rawAttrs.initialRouteName / rawAttrs.screenOptions directly",
  effect: "every kebab-authored option on <Stack>/<Tab>/<Drawer> in a .vue SFC silently fell back to its default",
  repro: "examples/vue-sfc DrawerDemoScreen.vue: drawer-position=\"right\" ⟶ drawer opened LEFT (caught via iOS simulator screenshot)",
  fix: "import normalizeVueAttrs from '@symbiote-native/vue'; const attrs = normalizeVueAttrs(rawAttrs) right after destructuring; replace every rawAttrs.X read with attrs.X",
  ruled_out: "formal defineComponent({ props: {...} }) schema ⟶ diverges from established idiom (verified: no component in this codebase declares formal runtime props)",
}
```

## Checklist for any new Vue lifecycle component

Before shipping a new `packages/*/src/vue/*.ts` component (or any new
`adapters/vue/src/**` component) that reads options off the setup context's `attrs`:

1. Does it read more than one word off attrs (`drawerPosition`, `screenOptions`,
   `initialRouteName`, `contentContainerStyle`, ...)? If yes, it needs
   `normalizeVueAttrs`.
2. `import { normalizeVueAttrs } from '@symbiote-native/vue';`
3. `const attrs = normalizeVueAttrs(rawAttrs);` immediately after destructuring
   `{ attrs: rawAttrs, ... }` from the setup context.
4. Read every option off `attrs`, never `rawAttrs`, from that point on.
5. Grep `normalizeVueAttrs` in `adapters/vue/src/` for a precedent matching your
   component's shape before inventing your own normalization.
