---
'@symbiote-native/svelte': major
---

`ActivityIndicator`, `Image`, `ImageBackground`, `RefreshControl`, `TouchableOpacity`,
`TouchableHighlight`, `TouchableWithoutFeedback`, `TouchableNativeFeedback`, `Button` and
`ScrollView` are no longer exported as components from `@symbiote-native/svelte`.

Every one is now the intrinsic tag Svelte's preprocessor lowers at compile time
(`<symbiote-view>` underneath `<view>`, and so on) — there is nothing left to import. `Image` and
`TouchableNativeFeedback` survive as RN's static namespaces (`Image.getSize`,
`TouchableNativeFeedback.Ripple`), moved to the module block since neither carries a view.
`KeyboardAvoidingView`, `Modal`, `VirtualizedList`, `FlatList` and `VirtualizedSectionList` are
unaffected. `Animated`'s component aliases go with them — there is no `Animated.View` /
`Animated.Text` / `Animated.Image` any more; an animated value resolves in any prop of the plain
tag directly (`<view style={{ opacity: someAnimatedValue }}>`), only `FlatList`/`SectionList`
still need the `Animated.*` alias form.

Migration: replace `import { Button } from '@symbiote-native/svelte'` + `<Button .../>` with
`<button .../>` — props are unchanged.
