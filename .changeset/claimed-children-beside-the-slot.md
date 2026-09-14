---
'@symbiote-native/engine': minor
'@symbiote-native/components': minor
---

`IHostBehavior.claimedChildren` keeps a named child on the owner instead of redirecting it into the
internal slot, and places it before that slot.

A ScrollView's RefreshControl is a sibling of the content view rather than one of its children, and
RN renders `{refreshControl}{contentContainer}` in that order. Claims are keyed by the child's
Fabric component name: a claim is only consulted for children of one owner, so the name is
unambiguous there and no node has to carry its intrinsic tag.

`insertBefore` and `removeChild` read the same rule, so an adapter that names the owner both places
a claimed child correctly and can take it away again.

Android is not this shape and is not covered: there the refresh control wraps the scroll view, which
needs a node above the owner rather than beside its slot.
