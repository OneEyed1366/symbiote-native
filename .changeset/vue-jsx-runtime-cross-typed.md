---
'@symbiote-native/vue': minor
'@symbiote-native/solid': patch
---

`@symbiote-native/vue` gains its own `jsx-runtime` module (for `jsxImportSource:
'@symbiote-native/vue'` in Vue-TSX apps), built on the new `ICrossTypedIntrinsics` shape: every
intrinsic tag types as a loose attribute bag except the ones with a real prop type
(`IPressableProps`, `IRefreshControlProps`, …), which type-check for real instead of accepting
anything. `intrinsic-elements.ts` and the `.vue` SFC `GlobalComponents`/Volar table move onto the
same generic, so a template and a TSX file no longer disagree on what a tag accepts.

`@symbiote-native/solid`'s existing `jsx-runtime.ts` (it reached this shape first) extends onto the
same shared generic rather than its own hand-rolled version.
