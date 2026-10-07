---
'@symbiote-native/solid': patch
---

README: the zero-config entry example was missing `import '@symbiote-native/solid'` — the bare side-effect import that registers host behaviors (Pressable/Switch/Image); `/bootstrap` alone doesn't reach it, and Metro's production `inlineRequires` drops it silently without the bare import. Fixes the exported-name count (eleven → twelve, missing `render`) and leads Install with `npx @symbiote-native/cli new`.
