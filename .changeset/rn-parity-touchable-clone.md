---
'@symbiote-native/engine': patch
---

The touchables stop mapping aria aliases RN's renders never read. `TouchableOpacity` and `TouchableHighlight` ignore `role` and `aria-labelledby`, and the highlight also ignores the aria state aliases. `TouchableWithoutFeedback` and `TouchableNativeFeedback` do not map `role` or `aria-labelledby` onto the child, and `TouchableWithoutFeedback` ignores `aria-label`.

`Image` drops the aria aliases RN's render never reads and applies `aria-hidden` the way each platform does: iOS turns `accessible` off, Android sets `importantForAccessibility`.
