---
'@symbiote-native/engine': minor
'@symbiote-native/linear-gradient': patch
'@symbiote-native/image': patch
'@symbiote-native/video': patch
'@symbiote-native/apple-authentication': patch
---

Add `styleOfProps` to the engine: the class and the inline style of a props bag in one list. `LinearGradient` on Android now rounds its native layer by a radius from a CSS class, and `Image` reads `resizeMode`, the Android background and the SF Symbol keys from a class, as it already did from `style`. `ImageBackground` gives `className` to its wrapping view, and `Image` takes a `VideoThumbnail` as a source. `VideoView`, `VideoAirPlayButton` and `AppleAuthenticationButton` accept `className` in React.
