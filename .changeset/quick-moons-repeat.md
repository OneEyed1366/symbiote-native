---
'@symbiote-native/react': patch
'@symbiote-native/angular': patch
---

Walk props bags with `Object.keys` instead of `Object.entries` on the per-node paths. `entries` allocates the outer array and a two-element array per key before the loop starts; `keys` allocates one array of strings, and the value is a property read the adapter is about to make anyway. Measured on `-O` Hermes over a four-key bag: 0.42 us against 0.23, so ~0.19 us per node - about 1.9 ms of a thousand-row create. No behaviour change; `applyUpdate`'s sibling loop already used `Object.keys`.
