// StackRouter: the registry-reconciliation half (framework-agnostic, zero render). A Stack's route
// list is navigation HISTORY, not a projection of the registered `<Stack.Screen>` markers the way a
// Tab's is (tab-router-state) - it seeds exactly one route and grows only through push/replace. So
// a marker that unregisters while its route still sits in the history (a marker behind an `{#if}`,
// a data-driven screen list) leaves behind an entry nothing can render: the route stays, the
// adapter's componentFor() finds no screen, and the user is parked on a blank RNSScreen with no
// way to tell what happened. Mirrors @react-navigation/routers' StackRouter.getStateForRouteNames-
// Change, which filters those routes out of the history and pulls the focused index back into
// range.
//
// Deliberately NOT a navigatorReducer action: this is not something a caller dispatches, it is a
// reaction to the registry changing underneath an unchanged history, and each adapter observes
// that change through its own lifecycle. Keeping it a separate pure function lets every adapter
// wire it its own way without teaching the reducer about a registry it has never seen.

import type { INavigatorState } from '../navigator-state';

// The contract, and the two places it deliberately parts from upstream:
//
// - SURVIVORS KEEP THEIR IDENTITY. A stack route's key is COUNTER-derived (every adapter's
//   createRoute increments a per-navigator sequence), not name-derived like a tab route's, so
//   re-deriving the list from the registry would hand every survivor a brand-new key and remount
//   live screens. Only the phantom entries go; every other route object passes through by
//   reference, params included.
//
// - THE FOCUSED ROUTE IS THE TOP ONE. This state carries no `index` field: the focused route is
//   always the last one (see computeActivityState's comment for why no route can outrank it), so
//   upstream's `index: Math.min(state.index, routes.length - 1)` degenerates here to "the last
//   survivor". Dropping the FOCUSED route therefore lands the user on the nearest still-registered
//   route beneath it - where a pop() would have left them - rather than on nothing.
//
// - THE ROUTE LIST IS NEVER EMPTIED. `routes.length - 1` IS the focused index, so an empty list
//   means no focused route at all - the blank screen this function exists to prevent. When nothing
//   in the history survives (every marker gone, or the whole screen set swapped for new names) the
//   state is returned UNCHANGED. Upstream instead pushes a freshly nanoid()-keyed route for
//   initialRouteName; we cannot, because minting a route key belongs to the caller here
//   (navigator-state.ts's header) and a derivation that mints one would allocate a new key on every
//   re-run. Unchanged is also the right answer for the usual cause of a momentarily empty registry
//   - markers unregistering and re-registering across a re-render - since the next run reconciles
//   for real.
export function reconcileStackRoutes(
  state: INavigatorState,
  registeredNames: readonly string[],
): INavigatorState {
  const routes = state.routes.filter(route =>
    registeredNames.includes(route.name),
  );
  // filter preserves order, so an unchanged length means nothing was dropped.
  if (routes.length === state.routes.length || routes.length === 0)
    return state;
  return { routes };
}
