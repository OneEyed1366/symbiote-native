---
'@symbiote-native/svelte': patch
---

README: the zero-config entry example was missing `import '@symbiote-native/svelte'` — the bare side-effect import that registers host behaviors (Pressable/Switch/Image); `/bootstrap` alone doesn't reach it, and Metro's production `inlineRequires` drops it silently without the bare import. Fixes the opening line and Parity section, both of which omitted Solid from the list of adapters sharing the core. Corrects the Node requirement (react-native 0.86 needs `>=22.13`, not `>=22.11`), documents the missing `collapseTextWhitespace` preprocessor, and leads Install with `npx @symbiote-native/cli new`.
