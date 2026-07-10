// Thin `inject()`-based selector function: subscribes to the router's `state` broadcast (stack.ts's
// `dispatch` re-emits the full INavigatorState to every route's emitter after each change) and
// returns a Signal of `selector(state)`, updating only when the emitted state changes — mirrors
// @react-navigation's useNavigationState and react/hooks/use-navigation-state.ts. The
// reducer/dispatch machinery it selects over lives in core/navigator-state.ts; this function only
// wires the subscription.
//
// Seeded from a single-route snapshot ({ routes: [route] }) rather than left undefined: the real
// broadcast lands after the FIRST dispatch, so a selector reading e.g. `state.routes.at(-1)?.name`
// still resolves correctly before any navigation action for the common single-route case, closing
// the same async gap useIsFocused documents.

import { DestroyRef, inject, signal, type Signal } from '@angular/core';
import { NAVIGATION_EVENT_STATE } from '../../core';
import type { INavigatorState } from '../../core';
import { NavigationContextService } from '../navigation-context.service';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNavigatorState(value: unknown): value is INavigatorState {
  return isRecord(value) && Array.isArray(value.routes);
}

export function useNavigationState<TResult>(
  selector: (state: INavigatorState) => TResult,
): Signal<TResult> {
  const context = inject(NavigationContextService, { optional: true });
  if (!context) {
    throw new Error(
      'useNavigationState must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>',
    );
  }
  const destroyRef = inject(DestroyRef);
  const route = context.route();
  if (route === undefined) {
    throw new Error(
      "useNavigationState: no route has been assigned to this screen's navigation scope yet",
    );
  }

  const result = signal(selector({ routes: [route] }));

  const unsubscribe = context.emitter.addListener(NAVIGATION_EVENT_STATE, (state: unknown) => {
    if (!isNavigatorState(state)) return;
    result.set(selector(state));
  });
  destroyRef.onDestroy(unsubscribe);

  return result.asReadonly();
}
