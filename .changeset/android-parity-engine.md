---
'@symbiote-native/engine': minor
---

Android now behaves as React Native 0.86 does.

- TextInput's C++ rules run on Android (`AndroidTextInput` was never recognized). Web aliases win over native props; `rows`, `tabIndex`, `readOnly` and `autoComplete` map per platform.
- ScrollView sends `sendMomentumEvents`, snap-edge defaults, `endFillColor`, and `nestedScrollEnabled` only under a refresh wrap. A press-bearing `<text>` gets Android `accessible` and the `link` role.
- Colors are signed ints on Android. `DynamicColorIOS` branches are processed, so they paint on iOS. `PlatformColor` builds `{ resource_paths }` on Android.
- Native modules follow RN: BackHandler is installed at bootstrap (`removeEventListener` is gone, as in RN), plus Alert, AccessibilityInfo, Linking, Share, Settings, ToastAndroid, PermissionsAndroid, Keyboard and Platform.
- `Image.getSize` returns nothing when given a success callback. Single-object source headers are dropped on Android.
- New `IHostBehavior.slotValueFor` hook.
