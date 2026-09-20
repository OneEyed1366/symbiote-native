---
'@symbiote-native/engine': major
---

The retained tree is C++ now. JS holds no tree at all and emits a command buffer instead.

`core/engine/cpp/SymbioteTree.cpp` owns the nodes, the clone-on-write commit and the tag-keyed
platform rules; `mutation-buffer.ts` is the wire format, and its header is the spec both sides are
held to.

Three things went rather than moved. The commit walk over dirty subtrees is gone, because the
framework names the nodes. Desired-vs-committed diffing is gone, because the framework names the
operations. `IMirror` is gone - it re-implemented `ShadowNode` in JS, which already carries children
and props, and existed only because reading it back costs a crossing. So the buffer carries the
adapter's alphabet instead of Fabric's, and the derivation disappears rather than relocating.

Reading a node is a function now, not a property: `parentOf`, `childrenOf`, `firstChildOf`,
`nextSiblingOf`, `componentOf`, `textOf`, `propOf`, `propsOf`, `committedPayloadOf`.

`ITreeHost` with `setTreeHost` / `treeHost` is how a host gets installed, and `readSurfaceTelemetry`,
`takePropKeyTally` and `takeNativeDebugLog` are what a test reads back out of it.
