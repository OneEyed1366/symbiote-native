---
'@symbiote-native/components': patch
---

The engine-node press behavior joins the Pressability lifecycle contract the five wrappers already
follow: it supplies the injected `now` the machine needs to time the 130 ms active-duration floor,
and runs the machine's own teardown on detach.

A lowered `<Pressable>` therefore holds its pressed look for the same floor a wrapped one does,
instead of releasing on the touch-up event.
