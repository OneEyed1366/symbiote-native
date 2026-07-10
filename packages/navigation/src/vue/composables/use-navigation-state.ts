// Thin selector wrapper: subscribes to the router's `state` broadcast (stack.ts's/tabs.ts's/
// drawer.ts's render loop re-emits the full router state to every route's emitter after each
// commit) and returns `selector(state)`, updating reactively only when the emitted state changes —
// mirrors @react-navigation's useNavigationState. The reducer/dispatch machinery it selects over
// lives in core/navigator-state.ts (and tab-router-state.ts/drawer-router-state.ts for the other
// two navigators); this composable only wires the subscription. The Vue twin of
// react/hooks/use-navigation-state.ts.
//
// Seeded from a single-route snapshot ({ routes: [route] }) rather than left undefined: the real
// broadcast lands after mount (Stack's render loop; tabs.ts/drawer.ts emit on focus), so a
// selector reading e.g. `state.routes.at(-1)?.name` still resolves correctly on first paint for
// the common single-route case, closing the same async gap useIsFocused documents.

import { onMounted, onUnmounted, ref } from '@vue/runtime-core';
import type { Ref } from '@vue/runtime-core';
import type { INavigatorState } from '../../core';
import { NAVIGATION_EVENT_STATE } from '../../core';
import { injectNavigationScope } from '../navigation-context';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNavigatorState(value: unknown): value is INavigatorState {
  return isRecord(value) && Array.isArray(value.routes);
}

export function useNavigationState<TResult>(
  selector: (state: INavigatorState) => TResult,
): Ref<TResult> {
  const scope = injectNavigationScope();
  if (scope === undefined) {
    throw new Error(
      'useNavigationState must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>',
    );
  }
  const result = ref(selector({ routes: [scope.value.route] })) as Ref<TResult>;
  let unsubscribe: (() => void) | undefined;

  onMounted(() => {
    unsubscribe = scope.value.emitter.addListener(NAVIGATION_EVENT_STATE, (state: unknown) => {
      if (!isNavigatorState(state)) return;
      result.value = selector(state);
    });
  });

  onUnmounted(() => unsubscribe?.());

  return result;
}
