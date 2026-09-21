---
"@symbiote-native/solid": patch
---

Rewrite the README to match the other adapters' shape (Install/Use it/Parity/Run it/Test it) and state explicitly that Solid's surface is verified on-device, same as React/Vue/Svelte/Angular. Also fixes a stale claim that `metro.config.js` needs `unstable_conditionNames: ['browser']` — it deliberately doesn't, and setting it would break the `react-native` resolution condition.
