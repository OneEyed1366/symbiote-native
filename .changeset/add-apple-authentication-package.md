---
'@symbiote-native/apple-authentication': minor
'@symbiote-native/expo-modules-link': minor
'@symbiote-native/solid': patch
'@symbiote-native/cli': patch
---

Add `@symbiote-native/apple-authentication`: the Sign in with Apple flow (`signInAsync`, `refreshAsync`, `signOutAsync`, `getCredentialStateAsync`, `formatFullName`, `addRevokeListener`) and `AppleAuthenticationButton` on React, Vue, Svelte, Solid and Angular, and an `--apple-authentication` layer in the CLI. `expo-modules-link` learns two manifest keys, `ios.infoPlistBooleanKeys` and `ios.entitlements`, and the Solid adapter gains `defineOptionalDescriptorComponent`.
