---
'@symbiote-native/vue': patch
---

README: the zero-config entry example was missing `import '@symbiote-native/vue'` — the bare side-effect import that registers host behaviors (Pressable/Switch/Image); `/bootstrap` alone doesn't reach it, and Metro's production `inlineRequires` drops it silently without the bare import. Fixes the Parity section still saying "Both adapters" (a leftover from when Vue was the second adapter) to name all five. Leads Install with `npx @symbiote-native/cli new`.
