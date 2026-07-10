// Thin `inject()`-based function: returns the current screen's route as a live Signal — mirrors
// @react-navigation's useRoute / react/hooks/use-route.ts, reactive rather than a one-shot read
// because a setParams call swaps in a new route object (same key) while the screen stays mounted
// (see navigation-context.service.ts's comment on why `route` is a signal there). Zero logic of
// its own beyond that signal read.

import { computed, inject, type Signal } from '@angular/core';
import type { IRoute } from '../../core';
import { NavigationContextService } from '../navigation-context.service';

export function useRoute(): Signal<IRoute<unknown>> {
  const context = inject(NavigationContextService, { optional: true });
  if (!context) {
    throw new Error(
      'useRoute must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>',
    );
  }
  // A `computed` (not the raw context.route signal) so the return type narrows to
  // `IRoute<unknown>` structurally — NavigationScopeDirective always assigns a route before any
  // content (and therefore any useRoute() caller) exists, so this only ever throws on misuse.
  return computed(() => {
    const current = context.route();
    if (current === undefined) {
      throw new Error("useRoute: no route has been assigned to this screen's navigation scope yet");
    }
    return current;
  });
}
