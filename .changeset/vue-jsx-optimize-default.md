---
'@symbiote-native/vue': minor
---

`@symbiote-native/vue/babel-jsx` now defaults `@vue/babel-plugin-jsx`'s `optimize: true`, generating
PatchFlags/`dynamicProps` for TSX apps the same way `.vue` SFCs already get from
`@vue/compiler-sfc`'s template compiler, unconditionally. A stateful list-row component's
`hasPropsChanged` walk on every patch — measured costing roughly half a re-render's non-engine time
on a 10%-of-1000 relabel — now skips straight to the flagged dynamic keys instead.

Verified against the real renderer (`adapters/vue/optimize-flag-safety.test.ts`): a changed prop, a
conditional branch, a keyed-list reorder, a spread-carried bag, and a stateful child component all
still recommit correctly with the flag on.

An app that hits an issue can opt back out: `symbioteVueJsx({ optimize: false })` in its own
`babel.config.js`.
