---
'@symbiote-native/react': minor
---

`@symbiote-native/react` now ships its own `jsx-runtime` / `jsx-dev-runtime` entry points and a
freshly-declared `JSX.IntrinsicElements`, in place of the old `declare module 'react'` merge that
`src/jsx.ts` used to perform.

A merge inherits every key `@types/react` already owns — `view`, `text`, `image` and `switch` are
real SVG element names there, so an unprefixed intrinsic tag of one of those names was a TS2717
("subsequent property declarations must have the same type"). Declaring the namespace fresh, and
pointing an app's `jsxImportSource` at `@symbiote-native/react`, is what frees the short tag names
from that collision — the prerequisite the later wrapper-retirement commits build on, not yet the
retirement itself.
