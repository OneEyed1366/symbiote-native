---
"@symbiote-native/expo-modules-link": minor
"@symbiote-native/application": patch
"@symbiote-native/battery": patch
"@symbiote-native/brightness": patch
"@symbiote-native/cellular": patch
"@symbiote-native/clipboard": patch
"@symbiote-native/crypto": patch
"@symbiote-native/device": patch
"@symbiote-native/haptics": patch
"@symbiote-native/keep-awake": patch
"@symbiote-native/local-auth": patch
"@symbiote-native/localization": patch
"@symbiote-native/network": patch
"@symbiote-native/screen-orientation": patch
"@symbiote-native/sensors": patch
"@symbiote-native/store-review": patch
"@symbiote-native/system-ui": patch
"@symbiote-native/tracking-transparency": patch
---

**Breaking:** native-module registration moves from a per-package `postinstall` to a single
app-level one. Every wrapper package drops its own `postinstall` script and its
`@symbiote-native/expo-modules-link` dependency; the app declares both instead:

```json
{
  "dependencies": { "@symbiote-native/expo-modules-link": "^0.2.0" },
  "scripts": { "postinstall": "symbiote-expo-link" }
}
```

Installing a wrapper package no longer registers it by itself - the app-level run does, and it
picks up every installed package at once. Apps already using these packages must add the two
lines above and reinstall; existing generated blocks are replaced by the new marker regions on
the first run.

**Why.** Package managers run sibling `postinstall` scripts concurrently, so the old design had
N independent OS processes doing read-modify-write on one shared `build.gradle` /
`MainApplication.kt`. Two could read the same version before either wrote back, and the later
write silently dropped the earlier package's registration - surfacing much later as a runtime
`Cannot find native module '<Name>'`. Closing that race needs cross-process mutual exclusion,
which plain `fs` cannot provide (no compare-and-unlink, no `flock`); successive attempts
narrowed the window to roughly one lost registration per hundred installs but never shut it.
Scanning `node_modules` once, from one process, removes the concurrency instead of synchronising
it - the same approach `expo-modules-autolinking` takes.

Owning a whole `BEGIN`/`END` region rather than appending lines also means entries come out
sorted (committed native files stop churning with a different order per machine), uninstalling a
package actually removes its registration (an append-only patcher could never do that), and no
lock files are left to leak or clean up after an interrupted install.

Also fixed along the way: permission descriptions written into `Info.plist` are now XML-escaped
(an `&` or `<` in a description previously produced an unparseable plist), and a description that
disagrees with the package's default is reported instead of silently ignored - the file itself is
still left as the developer wrote it.
