---
'@symbiote-native/solid': patch
'@symbiote-native/apple-authentication': patch
'@symbiote-native/camera': patch
'@symbiote-native/clipboard': patch
'@symbiote-native/contacts': patch
'@symbiote-native/gl': patch
'@symbiote-native/image': patch
'@symbiote-native/live-photo': patch
'@symbiote-native/video': patch
---

The native view wrappers accept `class` in their types on Solid and Svelte. The prop already reached
the native view, so only `typecheck` rejected it. On Solid the components made by
`defineDescriptorComponent`, `defineOptionalDescriptorComponent` and `defineNativeViewComponent`
take it too.

`IGLViewHandle` of `@symbiote-native/gl/svelte` now matches what `bind:this` gives: `getContextId()`
in place of `exglCtxId`, which was never on the Svelte instance.
