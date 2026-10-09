---
'@symbiote-native/react': patch
'@symbiote-native/solid': patch
---

`<text-input>` types `children` on React and Solid, and `ref` on React. A string child was already the input's text at runtime, but a typed app could not write `<text-input>hello</text-input>`.
