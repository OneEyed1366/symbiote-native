---
'@symbiote-native/components': patch
---

`TouchableWithoutFeedback` reads `aria-disabled` and `accessibilityState.disabled` for a `disabled` that is `null`, and only then, as React Native does.
