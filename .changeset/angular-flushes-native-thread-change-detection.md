---
'@symbiote-native/angular': patch
---

A native-thread callback (a press, a drag readout, a value change dispatched off Fabric's own
thread) now flushes Angular's zoneless change detection after writing the flat-bag `onX` property
it lands in. Angular has no zone.js hook into that thread, so a callback firing outside an Angular
event handler updated the bound state without ever telling `ApplicationRef` a check was due — a
drag readout or a live sensor value froze on screen at its first value until something unrelated
next triggered a tick. Also consolidates what had drifted into three near-duplicate callback
wrapper implementations into one.
