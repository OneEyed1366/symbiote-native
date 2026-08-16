---
"@symbiote-native/application": minor
"@symbiote-native/battery": minor
"@symbiote-native/brightness": minor
"@symbiote-native/cellular": minor
"@symbiote-native/clipboard": minor
"@symbiote-native/crypto": minor
"@symbiote-native/device": minor
"@symbiote-native/haptics": minor
"@symbiote-native/keep-awake": minor
"@symbiote-native/local-auth": minor
"@symbiote-native/localization": minor
"@symbiote-native/navigation": minor
"@symbiote-native/network": minor
"@symbiote-native/screen-orientation": minor
"@symbiote-native/secure-store": minor
"@symbiote-native/sensors": minor
"@symbiote-native/sharing": minor
"@symbiote-native/slider": minor
"@symbiote-native/sms": minor
"@symbiote-native/splash-screen": minor
"@symbiote-native/standard-web-crypto": minor
"@symbiote-native/store-review": minor
"@symbiote-native/system-ui": minor
"@symbiote-native/tracking-transparency": minor
"@symbiote-native/web-browser": minor
---

Declare the adapter peer dependencies as ranges instead of exact versions. Every package listed
`@symbiote-native/{react,vue,angular,svelte}` as `workspace:*` under `peerDependencies`, which
packs to whatever version was current at build time — so `@symbiote-native/battery@0.1.0` shipped
demanding exactly `@symbiote-native/react@0.2.8`, and an app on any other adapter version could
not install it without a peer conflict. They now read `>=<version>`, matching the shape
`@symbiote-native/engine` has carried since the singleton-peer rule was written.

The `workspace:*` entries under `devDependencies` are unchanged — those are what pnpm links for
in-repo development, and the engine rule requires them.

This also keeps release versioning honest. Changesets bumps a package to major whenever one of its
peer dependencies is bumped, so an exact peer pin turned every adapter release into a major bump
for all 25 packages regardless of what actually changed. With ranges plus
`onlyUpdatePeerDependentsWhenOutOfRange`, an adapter bump that stays inside the declared range no
longer forces one.
