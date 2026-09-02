---
'@symbiote-native/test-utils': minor
---

An oracle for lowering, and a settle that does not measure machine speed.

`lowering-equivalence` mounts a primitive as a component and as a bare intrinsic with the same
props and requires the two committed trees to match by key name. Committed rather than retained,
since anchors are exactly what lowering removes. It guards the two false greens that would
otherwise make it decorative — both arms taking the same path (caught by the retained node count,
which lowering must change) and both arms empty before `completeRoot`.

`fake-fabric` counts `appendChild` and `cloneNode` alongside `createNode`, so a benchmark arm can
show a tree is structurally identical before any timing is read.

`waitForQuiet` now settles on wall time as well as consecutive ticks, and `advanceMs` observes for
a duration. A tick count cannot express "no work arrived", only "the queue drained N times", and
how much wall time that spans is a property of the machine: a list committing one deferred batch
30-60 ticks in was declared quiet on an idle machine and caught under load, reading as free-running
change detection.
