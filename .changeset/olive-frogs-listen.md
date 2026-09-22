---
'@symbiote-native/engine': patch
---

Report `liveNodes` on `readSurfaceTelemetry()`: how many nodes the native tree holds right now. It is a level rather than a total, so it is not drained on read - which is what lets a test assert the tree gives its nodes back after a surface is cleared.
