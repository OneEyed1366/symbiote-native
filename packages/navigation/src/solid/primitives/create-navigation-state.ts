// Mirrors @react-navigation's useNavigationState. The reducer/dispatch machinery lives in
// core/navigator-state.ts (tab-router-state.ts / drawer-router-state.ts for the other two
// navigators) - this only wires the subscription to the `state` broadcast each navigator re-emits
// after its router state changes.
//
// `create*`: it owns a signal and a subscription.
//
// Seeded from a single-route snapshot ({ routes: [route] }) rather than left undefined: the real
// broadcast lands after the screen is built, so a selector reading e.g. `state.routes.at(-1)?.name`
// still resolves correctly on first paint for the common single-route case - the same async gap
// createIsFocused documents.

import { createSignal, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { NAVIGATION_EVENT_STATE, isRecord } from '../../core';
import type { INavigatorState } from '../../core';
import { requireNavigationScope } from '../navigation-context';

function isNavigatorState(value: unknown): value is INavigatorState {
  return isRecord(value) && Array.isArray(value.routes);
}

export function createNavigationState<TResult>(
  selector: (state: INavigatorState) => TResult,
): Accessor<TResult> {
  const scope = requireNavigationScope('createNavigationState');
  const [result, setResult] = createSignal<TResult>(
    selector({ routes: [scope().route] }),
  );

  const unsubscribe = scope().emitter.addListener(
    NAVIGATION_EVENT_STATE,
    (state: unknown) => {
      if (!isNavigatorState(state)) return;
      // The updater form, not a bare value: a selector legitimately returns a FUNCTION for a
      // navigation-driven callback, and `setResult(fn)` would otherwise be read as an updater.
      setResult(() => selector(state));
    },
  );

  onCleanup(unsubscribe);

  return result;
}
