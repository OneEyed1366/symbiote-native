---
'@symbiote-native/svelte': patch
---

Svelte lists export `setNativeProps` like RN's, so a `bind:this` ref satisfies `IVirtualizedListHandle`.
