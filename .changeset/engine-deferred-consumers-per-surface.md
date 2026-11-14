---
'@symbiote-native/engine': patch
---

On Android a container query that had to wait for its first layout kept its waiting nodes in one list for the whole process, so a second surface could clear or reuse the first one's. The waiting nodes now live per surface in `SymbioteDeferredConsumers.h`.
