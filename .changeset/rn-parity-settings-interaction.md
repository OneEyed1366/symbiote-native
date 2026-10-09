---
'@symbiote-native/engine': patch
---

`Settings.set` no longer fires `watchKeys` callbacks for the app's own write, as in RN (native ignores updates it caused, only an external `settingsUpdated` fires them), and `watchKeys` throws `keys should be a string or array of strings` for anything else. `InteractionManager` is RN 0.86's stub: tasks run on the next `setImmediate`, `createInteractionHandle` returns `-1` and blocks nothing, events never fire, a task error is thrown from a timer instead of rejecting the promise, and the `done` method is gone. `PanResponder.create` treats a `null` callback like a missing one instead of calling it. `LayoutAnimation.configureNext` races the native callback against a `duration + 17` ms timer, so `onAnimationDidEnd` fires even when native never answers, is a no-op when `Platform.isDisableAnimations` is set, and gains `setEnabled`; `checkConfig` logs through `console.error`.
