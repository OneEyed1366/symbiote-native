---
'@symbiote-native/store-review': patch
---

Correct the documented behavior of `isAvailableAsync()` and `requestReview()`. Android reports availability from the presence of the Play Store app, not from the OS version upstream's JSDoc claims, and a resolved `requestReview()` never means a prompt was shown — on Android the prompt appears only for a build installed from Google Play.
