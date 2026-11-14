---
'@symbiote-native/vue': minor
'@symbiote-native/svelte': minor
'@symbiote-native/solid': minor
'@symbiote-native/angular': minor
---

A component can read the tag of the surface it is rendered into: `useRootTag()` in Vue and Svelte, `injectRootTag` in Angular, `RootTagContext` in Solid. It is the argument `setVariable` needs, so a screen can write a CSS variable to its own surface.
