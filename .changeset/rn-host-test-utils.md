---
'@symbiote-native/test-utils': patch
---

`emitRnDeviceEvent` plays native on RN's device bus, and the recording host drops the hub fake that the engine no longer registers.
