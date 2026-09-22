---
'@symbiote-native/react': patch
---

README: the zero-config entry example was missing `import '@symbiote-native/react'` — the bare side-effect import that registers host behaviors (Pressable/Switch/Image); `/bootstrap` alone doesn't reach it, and Metro's production `inlineRequires` drops it silently without the bare import. Also corrects the Node requirement (react-native 0.86's own `package.json#engines` needs `>=22.13`, not `>=22.11`) and leads Install with `npx @symbiote-native/cli new`.
