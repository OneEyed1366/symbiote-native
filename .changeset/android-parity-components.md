---
'@symbiote-native/components': minor
---

Component behavior matches React Native 0.86 on both platforms.

- Pressable `android_ripple` and TouchableNativeFeedback send the ripple's view commands, so the ripple animates.
- Inverted lists flip with `scale: -1` on Android, and the app's style overrides the flip.
- On iOS, Modal stays mounted until native `onDismiss`. `visible` defaults to `true`.
- Button uppercases its Android title with the full Unicode `toUpperCase`.
- ScrollView dismisses the keyboard on `on-drag` on Android, trusts no keyboard event below API 30, and applies RN's `removeClippedSubviews` rules to the content view.
- TextInput's `rejectResponderTermination` applies on iOS. InputAccessoryView warns off iOS.
- The new press-machine option `cancelableOf` resolves `cancelable` per tag.
