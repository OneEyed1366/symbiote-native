---
'@symbiote-native/engine': minor
'@symbiote-native/components': minor
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

A claimed child can now become the owner's PARENT, which is what an Android RefreshControl is.

An Android ScrollView holds exactly one child, so a sibling refresh control is an `addViewAt`
crash — RN inverts the tree there instead of beside-placing like it does on iOS. `claimedChildren`
carries a mode per name, `beside` or `wrap`, and `ISymbioteNode.wrapper` records the inversion. The
adapter goes on naming the scroll view for every insert, prop write and command; only the two
structural entry points know a wrapper is what the tree holds.

`IHostBehavior.onWrapChange` is where a behavior answers for it. The wrapper is the app's own node,
so nothing could have given it a payload fold at creation — this is where the scroll view's layout
style moves up to it and its visual style stays below.

`splitScrollViewStyle` composes the axis base onto BOTH boxes, as RN does. All five adapters had
dropped it from the wrapper, so an `AndroidSwipeRefreshLayout` with no explicit user layout style
lost `flexGrow: 1` and collapsed to its content height inside a flex parent.

`insertBefore`'s `beforeChild` is typed nullable, which is what its callers always passed.
