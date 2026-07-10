// Thin lifecycle wrapper: returns the current screen's IRoute off the injected navigation scope —
// mirrors @react-navigation's useRoute. Zero logic of its own; the route object itself is built by
// stack.ts's/tabs.ts's/drawer.ts's render loop from the shared core reducer's state. The Vue twin
// of react/hooks/use-route.ts, returning a ComputedRef instead of a plain value.

import { computed } from '@vue/runtime-core';
import type { ComputedRef } from '@vue/runtime-core';
import type { IRoute } from '../../core';
import { injectNavigationScope } from '../navigation-context';

export function useRoute(): ComputedRef<IRoute<unknown>> {
  const scope = injectNavigationScope();
  if (scope === undefined) {
    throw new Error(
      'useRoute must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>',
    );
  }
  return computed(() => scope.value.route);
}
