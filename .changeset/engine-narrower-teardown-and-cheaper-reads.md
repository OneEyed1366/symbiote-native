---
'@symbiote-native/engine': minor
'@symbiote-native/test-utils': minor
---

Cut what a removal costs: a narrower teardown walk, a real `firstChildOf`, and a cheaper batch
boundary.

`ITreeHost` gains two required members. The type is an internal seam, exported to be read rather
than implemented outside this repo, so a new required member lands in a minor; both hosts shipped
here already have them.

- `firstChildOf` answers with one handle instead of `childrenOf(handle)[0]`. The old spelling read a
  list of N, then N-1, then N-2, so emptying a parent the way `solid-js/universal` does crossed
  N(N+1)/2 handles. A 2 000-row Solid clear went from 435 ms to 35 ms.
- `teardownSubtreesOf` returns only the nodes a teardown has work for: each root, each node carrying
  an intrinsic tag, and each node between the two. An animated binding is per node and carries no
  tag, so a tree holding one still gets the full walk.
- `applyOps` reads its four tables with `getObject`/`getArray` rather than the checking pair. The
  batch has one producer and the assert build keeps the checks, so a malformed batch still aborts
  there. Entering the host fell from 5.5 us to 2.8 us, which is what a framework reading the tree
  between mutations pays per read.

`isTornDown` and `hostBehavior` moved off a `WeakSet` and a `WeakMap` onto the node, so a node with
no behavior leaves the detach path before two lookups that were never going to find anything.
