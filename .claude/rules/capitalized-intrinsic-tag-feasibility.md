---
paths:
  - "adapters/**/*.{ts,tsx,cjs,svelte}"
  - "core/components/**/*.{ts,cjs}"
  - "core/engine/src/node.ts"
---

# A primitive can be a public TAG, not a component — but the cost is per-adapter

Read the `symbiote-primitive-tags` skill before planning, reviewing, or "simplifying" any of this.
It holds the measurements; this file holds only what must not be got wrong in passing.

**DECIDED 2026-09-01: the primitive resolves to a TAG and the IMPORT STAYS.** A globally available
name — no import — was priced and skipped: it is what costs, on two adapters for unrelated reasons
(Solid loses the import as EVIDENCE that a `View` is ours; Vue's global registration is a live
reference, so every app bundles all 12 wrappers). Do not reintroduce it as an ergonomic win.

- **Tag case decides whether a transform is NEEDED, never what it must DO.** React/Vue/Angular need
  no plugin (`export const View: 'symbiote-view' = 'symbiote-view'` — and TypeScript still resolves
  `JSX.IntrinsicElements`, so a bad prop is TS2322). Solid and Svelte keep a transform because their
  compilers decide by CASE — but Svelte's stays attribute-reading, because its props reach the
  engine only through the one `p={{…}}` bag.
- **The `symbiote-` hyphen is load-bearing in the INTERNAL tag — SUPERSEDED 2026-09-03.** The
  original claim was: `view`, `text`, `image` and `switch` are real SVG elements, so Solid emits
  `<svg><view …` and Svelte drops off the custom-element codegen path, stringifying props. Both
  halves fail when re-measured on the configurations this repo actually ships:

  ```
  solid, generate:'universal'  <view p={{a:1}}/> -> _$createElement("view"); _$setProp(el,"p",…)
                               same shape as symbiote-view. No _$template, no <svg>, no namespace.
  svelte, fragments:'tree'     set_custom_element_data -> set_attribute, from_tree flag 2 -> 4,
                               and yet the COMMITTED props are identical: {testID, nativeID}
                               unpacked into the node, nothing stringified.
  ```

  The `_$template(...)` in the old measurement is DOM-generator output; universal mode builds no
  template string, so there is no parser to put in a namespace. On Svelte the discriminator was
  never the SVG word — `stacklayout` behaves exactly like `view` — it is the HYPHEN, and the shim
  already survives losing it: `set_attribute` (svelte `dom/elements/attributes.js:204`) writes
  `element[attr] = value` for a non-string value when `get_setters` finds the setter, `p` IS a
  setter on `ShimElement.prototype` (`element.ts:86,90`), and `patch-globals.ts:79` points
  `g.Element` at `ShimElementBase` precisely so that prototype walk reaches it. That comment
  predicted this case before it existed.

  **The method lesson is the durable half: the old numbers were taken on the compilers' STOCK
  configuration, not on ours.** A generator flag (`generate:'universal'`) removed the entire
  mechanism the finding named, and nothing about the finding said which config produced it.

  Still NOT cleared, and none of it is about the SVG names: Svelte leaves the `importNode` clone
  path for `cloneNode` (one probe is not the suite that watches it), the engine's tag->component
  table maps only `symbiote-*` so a hyphenless tag commits `viewName: "view"`, and React, Vue and
  Angular were not measured in that pass. React also augments `declare module 'react'`, so a
  lowercase `view` would collide with `@types/react`'s own SVG entry (TS2717) until it moves to its
  own `jsxImportSource` the way Solid already has.
- **Never delete a wrapper before its folds have moved down.** They vanish SILENTLY — a lowered
  `readOnly` input accepts typing, a `disabled` Pressable announces itself as enabled. The runtime
  home is `foldHostBag` (`@symbiote-native/components/fold-host-bag`) plus `IHostBehavior`.
- **A per-adapter fact must not enter `HOST_PRIMITIVES`.** Whether a primitive exposes a public ref
  is answered differently by Solid (a tag hands back the same node) and Vue (only for stateful
  components), and both are right.
- **Engine-side state-style resolution must land BEFORE any adapter renames.** A functional `style`
  on a bare tag misses `setEventListener`, lands in `setProp` as a function, and `fabricProps`
  drops function props — the commit carries NO style, with nothing red.
