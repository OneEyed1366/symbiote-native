---
'@symbiote-native/engine': minor
'@symbiote-native/components': minor
---

Add the structure seam a COMPOSED host primitive needs: `IHostBehavior.buildStructure` and
`ISymbioteNode.childHost`.

`foldPayload` gave a lowered primitive its wrapper's prop mapping. Nothing gave it the wrapper's
composition, so a primitive built from more than one node — ScrollView is a scroll view wrapping a
content view — could not be lowered at all, whatever its props did.

A behavior may now build its own internal subtree once at attach and return the node the app's
children belong under. `appendChild` / `insertBefore` / `removeChild` redirect there, so an adapter
keeps naming the owner and never learns a slot exists — the same relationship a browser's `<video>`
has with its UA shadow tree.

`IHostBehavior.slotProps` is the prop twin: owner prop name -> slot prop name, applied in
`routeProp` and gated on the same field, so an app writes `contentContainerStyle` on the ScrollView
and it lands as the content node's `style`. A pure rename — precedence belongs to a `payloadFold`,
because the two orders are opposite (the scroll node's base style goes UNDER the app's, the
content node's `flexDirection: 'row'` goes OVER it).

Also lands `registerScrollViewBehavior()` in `@symbiote-native/components`, the first consumer: it
builds the same two nodes and composes the same two style arrays every adapter's wrapper does. It
is exported but called by nothing — `symbiote-scroll-view` is the tag the wrappers already emit and
they build their own content node, so a global registration would double-nest every existing
ScrollView. Splitting the wrapper and lowered tags — the `symbiote-text-input` /
`symbiote-text-input-managed` precedent — is the next step.
