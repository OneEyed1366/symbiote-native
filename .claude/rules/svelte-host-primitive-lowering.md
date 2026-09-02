---
paths:
  - 'adapters/svelte/src/preprocessor/lower-host-primitives.ts'
  - 'adapters/svelte/svelte.config.js'
  - 'adapters/svelte/metro-svelte-transformer.cjs'
  - 'adapters/svelte/src/components/View.svelte'
  - 'adapters/svelte/src/components/Text.svelte'
---

# `<View>`/`<Text>` are lowered to intrinsic tags — four things depend on it

A Svelte component boundary costs **anchor nodes**, not a component instance. Measured on the
1 000-row benchmark row: the retained tree held 23 006 nodes against every other adapter's 9 001 —
renderable 9 002 (identical) plus **14 004 anchors, 12 002 of them Svelte block/component
comments**, i.e. 12 per row for 6 component instances. `lowerHostPrimitives` rewrites
`<View>`/`<Text>` to `<symbiote-view p={{…}}>` / `<symbiote-text p={{…}}>` so those two stop being
components. Through the preprocessor end to end: 14 004 → 8 002 anchors, and both arms assert the
SAME 9 002 renderable nodes and 9 000 `createNode` calls.

- **It must run LAST, and after `scopedStyles` specifically.** Lowering turns `class="card"` into a
  bag expression, and the style scoper only rewrites a plain `class` attribute — reverse the order
  and every scoped class in the file silently stops being scoped, with nothing red anywhere.
- **Only tags the file imported from `@symbiote-native/svelte`.** Matching a bare tag name rewrites
  an app's own `<View>`.
- **The wrapper's real work is folded at COMPILE time, not deleted**: View's `id`→`nativeID` alias
  (id wins, per RN's `View.js`) and Text's `resolveTextProps` defaults (`ellipsizeMode ?? 'tail'`,
  `allowFontScaling !== false` — not `?? true`). Drop either and the failure is device-only and
  silent: a clamped `<Text>` clips mid-word instead of ellipsising.
- **Refusing is the safety property.** A `{...spread}`, a `bind:`, a `use:`, an `{@attach}` — any
  attribute this file cannot read whole — leaves the element a component. A half-read attribute set
  is a silently wrong bag.
- **And one refusal is NOT about readability: `children={…}` as an attribute.** It is a perfectly
  readable name/value pair, it lowered for months, and the child silently never mounted — a bag key
  goes through `routeProp`, where a snippet is not markup. Measured 2026-09-01: the component arm
  commits the child, the lowered arm emits `p={{testID: "parent", children: (kids)}}` and commits
  nothing. So the hazard has TWO doorways — hidden inside a spread, or handed over in plain sight —
  and closing only the first is how it shipped. The refusal keys on the NAME, because
  `children={kids}` is the spelling apps write and an identifier says nothing about what it holds.
  Both doors are break-tested separately in `preprocessor/ref-refusal.test.ts`; they fail different
  row sets, which is what proves neither is redundant.

`Pressable` and the other stateful components are NOT lowering candidates and already render
`<symbiote-view>` directly. Full measurement and the anchor census: the `svelte-adapter-dom-shim`
skill, §host-primitive lowering.
