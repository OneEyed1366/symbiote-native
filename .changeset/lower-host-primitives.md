---
'@symbiote-native/components': minor
'@symbiote-native/engine': minor
'@symbiote-native/angular': minor
'@symbiote-native/react': minor
'@symbiote-native/solid': minor
'@symbiote-native/svelte': minor
'@symbiote-native/vue': minor
---

Host primitives compile to intrinsic tags instead of framework components.

`View`, `Text`, `Image`, `SafeAreaView`, `InputAccessoryView`, `Switch`, `TextInput` and
`Pressable` are lowered at build time on Vue, Svelte, Solid and Angular, so a screen no longer
allocates a component instance, a props proxy, an anchor node or an LView per primitive. The
import and the call site are unchanged — which primitive is internally a tag is invisible to an
app.

What moved down with them:

- The state each primitive needs is an engine host behavior keyed on its tag, not a framework
  lifecycle. Press, switch, text-input, image and input-accessory-view all register one.
- The prop folds a wrapper used to perform run on the payload instead — `id` to `nativeID`,
  `Text`'s `ellipsizeMode`/`allowFontScaling` defaults, `TextInput`'s `inputMode`/`readOnly`/
  `enterKeyHint`, `Pressable`'s `disabled` accessibility state and its Android ripple. A lowered
  element commits the same payload as its wrapper; `core/test-utils`' equivalence oracle asserts
  it per primitive.
- The `aria-*`/`role` fold resolves in the engine, so it reaches every path rather than the
  fourteen component bodies that used to carry it.
- A functional `style={({pressed}) => …}` is specialised into a resting/active pair at build time,
  so the idiom the ecosystem writes lowers as authored. A CSS `:active` rule is not required.

A transform refuses where lowering would change what an app can observe: a spread on a stateful
primitive, a render-prop child, an instance-bound directive, a runtime value choosing the
intrinsic. All five transforms answer one shared fixture table, so a divergence is a failing row
rather than a device-only surprise.

React keeps its wrappers — it has no build-time analysis, and host and composite are both fibers —
and exports the same names.

Measured on an iOS 26.5 simulator, Release, 1 000 rows of 10 native views, against stock React
Native 0.86 on React's own Fabric renderer: Solid is under stock on all eight benchmark rows,
Svelte and Vue on six of eight. Create is 0.76x/0.80x/0.89x and Append 0.49x/0.54x/0.55x for
Solid/Svelte/Vue.
