---
'@symbiote-native/cli': patch
---

A new Svelte app now passes `npm run typecheck`: its `tsconfig.json` loads the adapter types, so
`<image resizeMode>` is no longer read as the SVG tag.

An app created earlier with this error needs `'@symbiote-native/svelte'` in `compilerOptions.types`.
