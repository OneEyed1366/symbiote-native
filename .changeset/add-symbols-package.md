---
'@symbiote-native/symbols': minor
'@symbiote-native/svelte': patch
'@symbiote-native/cli': patch
---

Add `@symbiote-native/symbols`: `SymbolView` (SF Symbols on iOS, Material Symbols on Android through `@symbiote-native/font`), the `androidWeights/*` fonts and `unstable_getMaterialSymbolSourceAsync` on React, Vue, Svelte, Solid and Angular, and a `--symbols` layer in the CLI. The Svelte `descriptor-host` component now renders the whole descriptor tree, not only one native leaf.
