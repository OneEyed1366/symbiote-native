---
'@symbiote-native/crypto': patch
'@symbiote-native/app-metrics': patch
---

Internal cleanup for lint: the crypto AES module files carry unique names, and the Svelte `AppMetricsRoot` passes its children straight through.
