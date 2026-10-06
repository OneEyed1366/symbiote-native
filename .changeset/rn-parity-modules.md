---
'@symbiote-native/engine': patch
---

`Dimensions.get` throws `No dimension set for key X` for an unknown key and `Dimensions.addEventListener` throws for any event but `change`, as in RN. `Alert` on iOS drops a trailing button with empty `text` like RN, and on Android reports a native dialog error through `console.warn`. `Vibration` on iOS ignores a number while a pattern runs, no longer calls the unimplemented native `cancel`, and throws for a pattern that is neither number nor array. `Linking` uses RN's URL validation messages. `ActionSheetIOS` runs its tint colors through `processColor`, validates arguments like RN and throws when `ActionSheetManager` is missing.
