---
'@symbiote-native/engine': minor
'@symbiote-native/react': minor
'@symbiote-native/vue': minor
'@symbiote-native/solid': minor
'@symbiote-native/svelte': minor
'@symbiote-native/angular': minor
---

Add `useEvent` and `useEventListener` (the `expo` package's hooks) to every adapter, for any emitter such as a native module or a shared object: React, Vue and Solid export them, Svelte has `@symbiote-native/svelte/runes/use-event`, Angular has `injectEvent` and `injectEventListener`. The engine gains `bindEventListener`, which they share.
