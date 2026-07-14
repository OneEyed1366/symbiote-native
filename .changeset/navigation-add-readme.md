---
"@symbiote-native/navigation": patch
---

Add the package README, following the `@symbiote-native/slider`/`@symbiote-native/splash-screen`
template: what the package wraps and why it can't be a third-party-view wrapper (the
`react-navigation` UI is React-only, so this is a genuine new shared component instead), install
instructions, the `core`/`register`/`react`/`vue`/`angular` shape, a `Stack` usage example per
adapter, and the documented drawer-parity gaps against `@react-navigation/drawer`
(`react-native-gesture-handler`/`react-native-reanimated` not being dependencies of this
codebase). The package previously shipped with no README at all.
