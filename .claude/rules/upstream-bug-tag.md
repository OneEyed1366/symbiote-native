---
paths:
  - "packages/*/src/core/*.ts"
  - "core/engine/src/**/*.ts"
  - "core/components/src/**/*.ts"
---

# A bug inherited from upstream gets TAGGED, not fixed

Most of `packages/*/src/core/**` is a hand-port of an `expo-*` module, and much of
`core/engine` is a hand-port of a React Native one. Ports carry upstream's bugs along
with its behavior. When you find one, the default is **keep parity and tag it** - a
silent divergence is worse than the inherited bug, because it breaks the one property
that makes these ports auditable against their source.

Tag format - the token is exactly `UPSTREAM-BUG` so `rg "UPSTREAM-BUG"` finds every one:

```ts
// UPSTREAM-BUG(expo): ScreenOrientation.ts:81 - the Android guard is truthy, so
// SCREEN_ORIENTATION_LANDSCAPE (0) is skipped and the call throws instead of locking.
// Ported verbatim for parity; do NOT fix without recording a deliberate divergence.
```

The parenthesised name is the upstream project (`expo` / `react-native`). Cite the
upstream file and line you actually opened, not one you inferred. Say what a CALLER
observes, not just what the code does - that is what a future reader needs to decide
whether the bug matters to them.

## Before tagging, prove it IS upstream's

Read the vendored source (`.vendors/expo`, `.vendors/react-native`) and compare. Three
of the first four "bugs" found this way turned out to be faithful ports, and two of
those were upstream behaving CORRECTLY while our comment described it wrong. A comment
that misdescribes correct code is a comment fix, not a code fix - do not "correct" the
code to match a wrong comment.

## When divergence IS the answer

Parity is the default, not a rule without exceptions. Diverge when the inherited bug is
dangerous rather than merely wrong - a silently empty crypto digest, a security check
that cannot fail closed. Record the divergence and its reason where the tag would have
gone, so the next person diffing against upstream knows the difference is deliberate.
