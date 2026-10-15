---
'@symbiote-native/engine': minor
---

`getShadowNodeWrapper(node)` returns the `ShadowNodeWrapper` that Fabric-level native libraries such
as Reanimated take for a view. `getFamilyGeneration(node)` changes when a reparent re-creates the
node's Fabric family, which stales every native registry keyed by family.

Both read the new `shadowNodeWrapperOf` / `familyGeneration` members of the native pod and answer
`undefined` against an older pod. The wrapper is a snapshot that pins the revision it was made from:
hold it only while the node is bound.

Three registries let a package that animates nodes take part in prop and style publication:
`registerPropClaim` takes a prop out of the payload, `registerStyleClaim` takes style keys
(`animation*`, `transition*`) out of the published style and hands them over, and
`registerStyleHandleClaim` recognises an animated style handle in `style`, publishes its starting
values with the node's first publish only and binds it to the node. `settleNodeStyle(node, values)`
keeps the values an animation settled on over the node's style across later publishes.
`bindToNode(node, attach)` runs `attach` once the node has committed and again after a commit that
re-created its family, and lets go of what it set up when the node leaves the tree. None of them
costs an app that registers nothing more than a length read.
