// Mirrors @react-navigation's useNavigationState; Svelte twin of
// vue/composables/use-navigation-state.ts. The reducer/dispatch machinery lives in
// core/navigator-state.ts (tab-router-state.ts / drawer-router-state.ts for the other two
// navigators) - this rune only wires the subscription to the `state` broadcast each navigator
// re-emits after commit.
//
// Seeded from a single-route snapshot ({ routes: [route] }) rather than left undefined: the real
// broadcast lands after mount, so a selector reading e.g. `state.routes.at(-1)?.name` still
// resolves correctly on first paint for the common single-route case - the same async gap
// useIsFocused documents.
//
// `$state.raw`, not `$state`: TResult is arbitrary app data (often the router state itself, whose
// route objects the reducer compares by identity), and a deep reactive proxy would hand callers
// a different object than the navigator holds - the same identity rule Vue's shallowRef enforces
// here.

import { untrack } from 'svelte';
import type { INavigatorState } from '../../core';
import { NAVIGATION_EVENT_STATE, isRecord } from '../../core';
import { requireNavigationScope } from '../navigation-context';

function isNavigatorState(value: unknown): value is INavigatorState {
  return isRecord(value) && Array.isArray(value.routes);
}

export function useNavigationState<TResult>(selector: (state: INavigatorState) => TResult): {
  readonly current: TResult;
} {
  const scope = requireNavigationScope('useNavigationState');
  let result = $state.raw<TResult>(selector({ routes: [scope.current.route] }));

  // Empty dependency set (see use-is-focused.svelte.ts): subscribe once, tear down once.
  $effect(() => {
    const { emitter } = untrack(() => scope.current);
    return emitter.addListener(NAVIGATION_EVENT_STATE, (state: unknown) => {
      if (!isNavigatorState(state)) return;
      result = selector(state);
    });
  });

  return {
    get current(): TResult {
      return result;
    },
  };
}
