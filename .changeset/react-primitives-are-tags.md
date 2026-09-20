---
'@symbiote-native/react': major
---

`View`, `Text`, `Image`, `ScrollView`, `TextInput`, `Switch`, `SafeAreaView`, `RefreshControl`,
`InputAccessoryView`, `ActivityIndicator`, `ImageBackground`, `Button`, `TouchableWithoutFeedback`
and `TouchableNativeFeedback` are no longer exported as components from `@symbiote-native/react`.

Each is now the intrinsic tag it already compiled to under `jsxImportSource: '@symbiote-native/react'`
(`<view>`, `<text>`, `<scroll-view>`, `<switch>`, …) — write the tag directly, there is nothing left
to import in the wrapper's place. `TouchableNativeFeedback` and `Image` survive as RN's own static
namespaces (`Image.getSize`, `TouchableNativeFeedback.Ripple`), re-exported from
`@symbiote-native/components` instead of a local wrapper. Every prop type (`IViewProps`,
`ITextProps`, `IScrollViewProps`, …) still exports for a component that forwards a bag onward.

`KeyboardAvoidingView`, `Modal`, `Pressable`, `TouchableOpacity`, `TouchableHighlight`,
`FlatList`, `VirtualizedList` and `SectionList` are unaffected — real composite behavior a single
tag cannot express, or (`Pressable`, the two remaining Touchables) still genuinely components on
this adapter.

Migration: replace `import { ScrollView } from '@symbiote-native/react'; <ScrollView .../>` with
`<scroll-view .../>` — no import needed, the props are unchanged.
