---
'@symbiote-native/components': minor
---

Add `@symbiote-native/components/register`: every host behavior (`registerScrollViewBehavior`,
`registerSwitchBehavior`, `registerTextInputBehavior`, the sticky-header and image behaviors, …)
now registers from one shared module instead of five adapters each re-declaring the same call
list in their own `register.ts`.

The list had already drifted once between adapters before this landed — a behavior added for one
framework and forgotten in another is now structurally impossible, since there is only one list to
edit. `registerScrollViewBehavior()` itself is finally called for real (it existed since the
structure-seam work but nothing invoked it while the wrappers still built their own content node);
every adapter pulls it in through this entrypoint now that the wrappers are gone.
