---
'@symbiote-native/vue': major
---

`ActivityIndicator`, `Button`, `ImageBackground`, `TouchableWithoutFeedback`,
`TouchableNativeFeedback`, `Switch`, `TextInput`, `Pressable`, `TouchableOpacity`,
`TouchableHighlight` and `ScrollView` are no longer exported as components from
`@symbiote-native/vue`.

Vue's SFC and TSX transforms already lower each of these to its intrinsic tag at build time
(`<view>`, `<pressable>`, `<scroll-view>`, …) whenever the primitive spec in
`core/components/host-primitives.cjs` allows it — this removes the JS wrapper that only ever ran
for the elements the compiler could not statically lower. `TouchableNativeFeedback` survives as RN's
static namespace, re-exported from `@symbiote-native/components`. Every prop type stays exported for
a component that forwards a bag onward.

Migration: replace `import { Switch } from '@symbiote-native/vue'` + `<Switch .../>` with
`<switch .../>` in a template, or the plain-`h()` call with the lowercase tag name — props are
unchanged.
