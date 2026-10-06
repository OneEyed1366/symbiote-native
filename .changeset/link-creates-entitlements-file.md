---
'@symbiote-native/expo-modules-link': patch
---

When a package declares `ios.entitlements` and the app has no `.entitlements` file, the linker now creates `<App>/<App>.entitlements` next to `Info.plist` and wires it into the Xcode project (a file reference, a group entry and `CODE_SIGN_ENTITLEMENTS` on the app target only). Without an Xcode project to anchor on it creates nothing and warns. An empty `<dict/>` written by Xcode is filled in as well.
