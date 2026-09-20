---
'@symbiote-native/engine': minor
'@symbiote-native/components': minor
'@symbiote-native/react': minor
'@symbiote-native/vue': minor
'@symbiote-native/svelte': minor
'@symbiote-native/solid': minor
'@symbiote-native/angular': minor
---

Every item here is a place the press family answered differently from `react-native@0.86`, found by
reading its source.

Two controls fired backwards. `Switch` called `onValueChange` before `onChange` (`Switch.js:201-207`),
`TextInput` called `onChangeText` before `onChange` (`TextInput.js:504-506`). Vendor fires the event
handler first, so an app reading `event.nativeEvent` to accept or reject a value saw it after the
value had been announced. `_onSelectionChange` had the same inversion (`:522-533`).

`disabled` was only ever the raw prop. All three touchables resolve `disabled ?? aria-disabled ??
accessibilityState.disabled` before configuring Pressability (`TouchableOpacity.js:186` and siblings;
Highlight has no `aria` leg, an upstream inconsistency matched rather than fixed). A control disabled
through `accessibilityState` alone greyed out and kept firing `onPress`.

The long-press timer is armed at `RESPONDER_GRANT`, so its threshold from touch-down is a flat 500 ms
instead of 500 ms after press-in settles (`Pressability.js:471-478`). Movement is gated by a separate
10 px jitter threshold, checked before the retention region (`:502-508`).

`blockNativeResponder` is new across the family. `onResponderGrant` returns it (`Pressability.js:479`)
to tell native to stand down, so a parent `ScrollView` cannot steal a claimed gesture mid-drag. We sent
the default and yielded.

`touchSoundDisabled` is new too, reaching Pressability as `android_disableSound`. It gates the Android
release-time `SoundManager.playTouchSound()` (`:749-757`), a call that did not exist here - hence the
new `SoundManager` engine module.

`Pressable`'s bare tag commits `collapsable: false` unconditionally (`Pressable.js:340`). `Switch`
claims the responder on both platforms (`:238-239,288-289`) and builds `accessibilityState` only once
`disabled` resolves to something (`:235-238`). Both are tag rules in `SymbioteFabricProps.cpp`; the
adapters gained prop declarations and nothing else.
