---
'@symbiote-native/solid': major
---

`Button` and `ImageBackground` are no longer exported as components from `@symbiote-native/solid`,
and the `<scroll-view>` tag drops the last wrapper still standing behind it.

`Animated.View`, `Animated.Text` and `Animated.Image` are also gone — there is no dotted alias for a
primitive that is already a tag; an animated value resolves in any prop of the plain element
directly (`<view style={{ opacity: someAnimatedValue }}>`, `.claude/rules/animated-values-resolve-in-the-engine.md`).
Only `Animated.ScrollView`, `Animated.FlatList` and `Animated.SectionList` remain, for the three
primitives still genuinely components.

Migration: replace `import { Button } from '@symbiote-native/solid'` + `<Button .../>` with
`<button .../>`, and `<Animated.View style={...}/>` with `<view style={...}/>` — props are
unchanged.
