// Thin selector wrapper: subscribes to the router's `state` broadcast (stack.ts's render loop
// re-emits the full INavigatorState to every route's emitter after each commit) and returns
// `selector(state)`, re-rendering only when the emitted state changes — mirrors
// @react-navigation's useNavigationState. The reducer/dispatch machinery it selects over lives in
// core/navigator-state.ts; this hook only wires the subscription + local re-render.
//
// Seeded from a single-route snapshot ({ routes: [route] }) rather than left undefined: the real
// broadcast lands a tick later (post-commit useEffect), so a selector reading e.g.
// `state.routes.at(-1)?.name` still resolves correctly on first paint for the common single-route
// case, closing the same async gap useIsFocused documents.

import { useContext, useEffect, useState } from 'react';
import type { INavigatorState } from '../../core';
import { NAVIGATION_EVENT_STATE } from '../../core';
import { NavigationContext } from '../navigation-context';

export function useNavigationState<TResult>(
  selector: (state: INavigatorState) => TResult,
): TResult {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error(
      'useNavigationState must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>',
    );
  }
  const { route, emitter } = context;
  const [result, setResult] = useState(() => selector({ routes: [route] }));

  useEffect(() => {
    return emitter.addListener(NAVIGATION_EVENT_STATE, (state: unknown) => {
      if (!isNavigatorState(state)) return;
      setResult(selector(state));
    });
  }, [emitter, selector]);

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNavigatorState(value: unknown): value is INavigatorState {
  return isRecord(value) && Array.isArray(value.routes);
}
