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

Add a `./svelte` entry point to every package, so a Svelte app reaches the same surface React, Vue
and Angular already have. The split follows each package's existing shape rather than a uniform
template: packages whose surface is free async functions with no per-instance state
(`application`, `crypto`, `device`, `haptics`, `local-auth`, `secure-store`, `sharing`, `sms`,
`standard-web-crypto`, `store-review`, `system-ui`, `web-browser`) re-export the same core
verbatim, exactly as their React/Vue/Angular entry points already do.

Packages carrying live state or an event subscription get a runes-based lifecycle instead — the
Svelte twin of the React hook and the Vue composable, written as `*.svelte.ts` so `$state` and
`$effect` are compiled: `battery`, `brightness`, `cellular`, `clipboard`, `keep-awake`,
`localization`, `network`, `screen-orientation`, `sensors`, `slider`, `splash-screen`,
`tracking-transparency`, and the `navigation` stack/tabs/drawer family.

The core stays untouched in every case — the entry point supplies only the lifecycle, so the
Svelte surface cannot drift from the other adapters' by construction.
