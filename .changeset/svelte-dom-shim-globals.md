---
'@symbiote-native/svelte': patch
---

Add the `getComputedStyle` and `CustomEvent` globals so `createEventDispatcher` works, and `parentElement`, `clientWidth`, `clientHeight`, `getBoundingClientRect` and `animate` on shim elements. `transition:` and `animate:flip` stay off for now: they render without animating.
