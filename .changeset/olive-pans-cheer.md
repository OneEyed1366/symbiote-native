---
'@symbiote-native/engine': minor
---

Report `nodesCreated`, `applyCalls`, `applyMs` and `decodeMs` on `readCommitProfile()`. Creates are issued from C++ and never reach `global.nativeFabricUIManager`, so a JS wrapper over that binding counts zero; the census now comes from the engine's own walk, keyed to the last committed surface. `applyMs` is the whole crossing into C++ and `decodeMs` the part of it that reads the buffer out of JS - the pair that says whether one big crossing is cheaper than ten thousand small ones on a given engine. Reading the profile drains surface telemetry as a result.
