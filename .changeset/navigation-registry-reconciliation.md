---
"@symbiote-native/navigation": minor
---

Keep the navigators in step with their registered screens, and stop the drawer from disagreeing
with its own animation.

**Tabs kept a tab for a screen that had gone.** The router state was seeded once from the
registered `<Tab.Screen>` markers and never reconciled, so a screen unregistered after mount left
its tab in the bar forever - rendering a passthrough item labelled with the raw route name. A new
shared `reconcileTabRoutes` (modelled on `@react-navigation/routers`' `TabRouter.getStateForRoute-
NamesChange`) takes membership and order from the live registry while a surviving route keeps its
key and accumulated params; focus follows the previously focused route by NAME and falls back to
the first route when that one is gone. All four adapters consume it.

**Stack kept a phantom entry.** Its route list is navigation history, not a projection of the
markers, so unregistering the marker for a route already pushed left the entry in place with
nothing to render - a blank screen with no way back. `reconcileStackRoutes` filters history by
registered name, preserves surviving routes by reference (a stack key is counter-derived, so
re-deriving would re-key and remount live screens), and repairs focus to the nearest survivor,
which is where a `pop()` would have landed. It deliberately returns the state unchanged rather than
emptying the list: minting a replacement route key belongs to the caller, and an empty registry is
usually just markers mid-re-registration.

**`jumpTo` to an unregistered route left the drawer open while animating it shut.** The animation
ran off a snapshot of `isOpen` taken before dispatching, but the reducer treats an unknown route
name as a no-op and returns the same state. State said open, the panel slid closed, and nothing
reconciled them. Each adapter now drives the animation from what the reducer actually produced.
