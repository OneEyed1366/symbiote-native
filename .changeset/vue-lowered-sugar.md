---
'@symbiote-native/vue': minor
---

A lowered element retargets Vue's own template sugar, and three of those retargets destroyed a
prop before any adapter code ran.

`v-bind="bag"`, `mergeProps` and a bare `:style="fn"` each reach `@vue/shared`'s `normalizeStyle`,
which returns `undefined` for a function — so a functional `style` inside a spread was gone before
the engine could specialise it. The three helpers call `normalizeStyle` by module-internal
reference, so one override cannot cover the others; all three are now shimmed in
`runtime-helpers`, scoped to `style` and preserving a top-level callback only. An array containing
a callback stays out of contract, matching RN's own `Pressable` types.

`v-model` on a lowered element compiles to the `vModelText` runtime directive whatever the
primitive is, because Vue picks the directive by element and every lowered tag looks the same to
it. On `Switch` that stringified the value and the behavior read `String(true)` as off forever;
the write now branches on the primitive.
