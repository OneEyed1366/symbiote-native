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
- **The `symbiote-` hyphen is load-bearing in the INTERNAL tag.** `view`, `text`, `image` and
  `switch` are real SVG elements: Solid emits `<svg><view …` and Svelte drops off the
  custom-element codegen path, stringifying props. The public name is capitalized and carries no
  prefix; the short lowercase form must never exist at any stage.
- **Never delete a wrapper before its folds have moved down.** They vanish SILENTLY — a lowered
  `readOnly` input accepts typing, a `disabled` Pressable announces itself as enabled. The runtime
  home is `foldHostBag` (`@symbiote-native/components/fold-host-bag`) plus `IHostBehavior`.
- **A per-adapter fact must not enter `HOST_PRIMITIVES`.** Whether a primitive exposes a public ref
  is answered differently by Solid (a tag hands back the same node) and Vue (only for stateful
  components), and both are right.
- **Engine-side state-style resolution must land BEFORE any adapter renames.** A functional `style`
  on a bare tag misses `setEventListener`, lands in `setProp` as a function, and `fabricProps`
  drops function props — the commit carries NO style, with nothing red.
