---
"@symbiote-native/cli": patch
---

Fix every scaffolded app's native boot splash showing React's logo regardless of the chosen framework — iOS displays `BootSplash.storyboard` as the launch screen unconditionally, so a Vue/Svelte/Solid/Angular app booted with React's own branding until the JS bundle took over. `new` and `add --splash-screen` now overlay the matching framework's logo (same assets `examples/*` already ship) on both iOS and Android; React needs no overlay since it already is the base.
