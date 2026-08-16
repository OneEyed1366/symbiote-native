// Mirrors @react-navigation's useRoute; Svelte twin of vue/composables/use-route.ts. Zero logic
// of its own - the route object itself is built by Stack's/Tab's/Drawer's render loop from the
// shared core reducer's state.

import type { IRoute } from '../../core';
import { requireNavigationScope } from '../navigation-context';

export function useRoute(): { readonly current: IRoute<unknown> } {
  const scope = requireNavigationScope('useRoute');

  return {
    get current(): IRoute<unknown> {
      return scope.current.route;
    },
  };
}
