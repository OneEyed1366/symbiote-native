---
'@symbiote-native/svelte': minor
'@symbiote-native/engine': patch
'@symbiote-native/css-parser': patch
'@symbiote-native/reanimated': patch
'@symbiote-native/age-range': patch
'@symbiote-native/app-integrity': patch
'@symbiote-native/app-metrics': patch
'@symbiote-native/apple-authentication': patch
'@symbiote-native/application': patch
'@symbiote-native/asset': patch
'@symbiote-native/audio': patch
'@symbiote-native/auth-session': patch
'@symbiote-native/background-fetch': patch
'@symbiote-native/background-task': patch
'@symbiote-native/battery': patch
'@symbiote-native/blob': patch
'@symbiote-native/blur': patch
'@symbiote-native/brightness': patch
'@symbiote-native/calendar': patch
'@symbiote-native/camera': patch
'@symbiote-native/cellular': patch
'@symbiote-native/clipboard': patch
'@symbiote-native/constants': patch
'@symbiote-native/contacts': patch
'@symbiote-native/crypto': patch
'@symbiote-native/device': patch
'@symbiote-native/document-picker': patch
'@symbiote-native/file-system': patch
'@symbiote-native/font': patch
'@symbiote-native/gl': patch
'@symbiote-native/glass-effect': patch
'@symbiote-native/haptics': patch
'@symbiote-native/image-manipulator': patch
'@symbiote-native/image-picker': patch
'@symbiote-native/image': patch
'@symbiote-native/intent-launcher': patch
'@symbiote-native/keep-awake': patch
'@symbiote-native/linear-gradient': patch
'@symbiote-native/live-photo': patch
'@symbiote-native/local-auth': patch
'@symbiote-native/localization': patch
'@symbiote-native/location': patch
'@symbiote-native/mail-composer': patch
'@symbiote-native/media-library': patch
'@symbiote-native/navigation-bar': patch
'@symbiote-native/navigation': patch
'@symbiote-native/network': patch
'@symbiote-native/notifications': patch
'@symbiote-native/print': patch
'@symbiote-native/screen-capture': patch
'@symbiote-native/screen-orientation': patch
'@symbiote-native/secure-store': patch
'@symbiote-native/sensors': patch
'@symbiote-native/sharing': patch
'@symbiote-native/slider': patch
'@symbiote-native/sms': patch
'@symbiote-native/speech': patch
'@symbiote-native/splash-screen': patch
'@symbiote-native/sqlite': patch
'@symbiote-native/standard-web-crypto': patch
'@symbiote-native/store-review': patch
'@symbiote-native/symbols': patch
'@symbiote-native/system-ui': patch
'@symbiote-native/task-manager': patch
'@symbiote-native/tracking-transparency': patch
'@symbiote-native/video-thumbnails': patch
'@symbiote-native/video': patch
'@symbiote-native/web-browser': patch
---

The Svelte adapter now drives Svelte's own custom renderer API (`svelte/renderer`) instead of DOM
emulation. This needs `svelte >= 5.59.1` and the compiler option `experimental.customRenderer`, and
the API is experimental in Svelte itself.

`bind:`, `on:`, `transition:`, `animate:`, `{@html}` and `<svelte:window|document|body|head>` are now
compile errors. Use `{@attach}` for element refs and `onX={...}` props for events.

Svelte elements are now the engine's own nodes, so a `{@attach}` ref receives an engine node and the
DOM-like element class is gone. A DOM-style action that calls `appendChild` or `remove` on its
element no longer works, and a `use:portal` action from a community package breaks: use `Portal`.

The engine now tells a style claim (the CSS animations of Reanimated) about an `animation*` style
that follows a class made of claimed keys alone. Before, that style never reached `CSSManager`.
