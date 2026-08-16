---
'@symbiote-native/css-parser': patch
'@symbiote-native/engine': patch
---

Fix compound selectors (`.card.featured`) under a scoped `<style>` block. The parser emitted the
compound rule as a replacement for the single-class rules it built on instead of a layer over
them, so an element carrying both classes lost everything `.card` alone had declared and kept only
what `.card.featured` restated. Unscoped stylesheets were unaffected, which is why this survived:
the scope-suffixed class name is what pushed the rule down the wrong path.

The engine's style registry resolves the layered form correctly for every adapter, so the fix
lands identically through React's `className`, Vue's `class`/`:class`, Angular's
`class`/`[ngClass]`, and Svelte's `class` — verified against a compound-class demo now present on
every canary.
