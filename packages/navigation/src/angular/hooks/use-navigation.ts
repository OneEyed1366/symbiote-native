// Thin `inject()`-based function: returns the current screen's navigator handle (push/pop/replace/…
// for a Stack screen, jumpTo/setParams for a Tab screen, openDrawer/… for a Drawer screen) plus
// addListener bound to that route's own emitter — mirrors @react-navigation's
// `navigation.addListener('focus', cb)` surface, and react/hooks/use-navigation.ts's useNavigation.
// All pub/sub logic lives in ../../core/navigation-events; this function only reads
// NavigationContextService and binds identity. Must be called from an Angular injection context
// (a component/directive constructor or field initializer — Angular's own convention for `inject`,
// `takeUntilDestroyed`, …), the direct twin of a React hook's "only call at the top of a component"
// rule.

import { inject } from '@angular/core';
import type { INavigationEventListener, INavigationEventName } from '../../core';
import { NavigationContextService, type IAnyNavigatorHandle } from '../navigation-context.service';

export type INavigationHandle = IAnyNavigatorHandle & {
  addListener: (event: INavigationEventName, listener: INavigationEventListener) => () => void;
  // Walks exactly ONE hop up NavigationContextService's `parent` chain to the enclosing
  // navigator's handle — mirrors react/hooks/use-navigation.ts's getParent() exactly (plain
  // immediate-parent walking, no named/targeted ancestor lookup).
  getParent: () => IAnyNavigatorHandle | undefined;
};

export function useNavigation(): INavigationHandle {
  const context = inject(NavigationContextService, { optional: true });
  if (!context) {
    throw new Error(
      'useNavigation must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>',
    );
  }
  return {
    ...context.navigation,
    addListener: context.emitter.addListener,
    getParent: () => context.parent?.navigation,
  };
}
