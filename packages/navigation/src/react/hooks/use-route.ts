// Thin lifecycle wrapper: returns the current screen's IRoute from NavigationContext — mirrors
// @react-navigation's useRoute. Zero logic of its own; the route object itself is built by
// stack.ts's render loop from the core reducer's state.

import { useContext } from 'react';
import type { IRoute } from '../../core';
import { NavigationContext } from '../navigation-context';

export function useRoute(): IRoute<unknown> {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error(
      'useRoute must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>',
    );
  }
  return context.route;
}
