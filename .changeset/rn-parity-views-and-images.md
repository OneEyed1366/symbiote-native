---
'@symbiote-native/engine': minor
'@symbiote-native/components': minor
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

The same vendor read, applied to the view primitives.

`InputAccessoryView` renders `null` on Android. We committed a real, laid-out `RCTView` and its whole
subtree there. `VOID_COMPONENT` is the engine primitive for it: where `ANCHOR_COMPONENT` hoists its
children up in its place, a void node contributes neither itself nor them.

`Image` gets three vendor rules back. `defaultSource` resolves through `resolveAssetSource` like every
other source slot (`ImageViewNativeComponent.js:138`), `alt` sets `accessible` unconditionally
(`Image.android.js:272-273`), and the four load events stay silent on Android until
`shouldNotifyLoadEvents` is on - vendor raises it whenever any one of them is authored, which is what
`IMAGE_LOAD_EVENT_NAMES` answers.

`ImageBackground` carries `importantForAccessibility` down to both of its nodes; vendor destructures it
out of the spread and reapplies it explicitly (`:67,76,82`).

`Modal` pinned its container to the left edge always - vendor picks the edge off `I18nManager.isRTL`
(`Modal.js:372`). `ActivityIndicator` never sent Android `styleAttr` and `indeterminate` (`:100-103`),
so the spinner took whatever the ViewManager defaulted to. `KeyboardAvoidingView` uses vendor's own
duration formula, floor included (`:169-179`).

`TouchableWithoutFeedback` needs `nativeID` to beat `id`, the reverse of every other tag.
`IHostBehavior.nativeIdWinsOverId` says so once at `createElement` instead of each writer guessing.
