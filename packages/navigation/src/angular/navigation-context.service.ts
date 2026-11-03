// A screen's route, navigator handle and emitter live in one service, a fresh instance per route
// `NavigationScopeDirective` provides it, and `parent` is the nearest ancestor instance

import { Injectable, inject, signal, type Signal } from '@angular/core';
import type {
  IEdgeInsetState,
  INavigationEmitter,
  IRoute,
  IAnyNavigatorHandle,
  ITransitionProgress,
} from '../core';

export type { IAnyNavigatorHandle } from '../core';

// Not `providedIn: 'root'`, each `NavigationScopeDirective` usage re-provides it for its own route
@Injectable()
export class NavigationContextService {
  private readonly ambientParent = inject(NavigationContextService, {
    optional: true,
    skipSelf: true,
  });

  // `route` is a signal, as `setParams` swaps in a new route object while the screen stays mounted
  // `navigation` and `emitter` are stable for the screen's lifetime, so they stay plain fields
  private readonly routeSignal = signal<IRoute<unknown> | undefined>(undefined);
  readonly route: Signal<IRoute<unknown> | undefined> =
    this.routeSignal.asReadonly();

  navigation!: IAnyNavigatorHandle;
  emitter!: INavigationEmitter;
  // Only a Stack route has one, as native sends transition events for stack screens alone
  transitionProgress?: ITransitionProgress;
  // The insets this screen's header took, a nested header reads them up the `parent` chain
  edgeInsets?: IEdgeInsetState;

  get parent(): NavigationContextService | undefined {
    return this.ambientParent ?? undefined;
  }

  setRoute(route: IRoute<unknown>): void {
    this.routeSignal.set(route);
  }
}

// The throw every `inject*` function shares, so its wording lands once
// Needs an injection context, as `inject()` itself does
export function requireNavigationContext(
  injectorName: string,
): NavigationContextService {
  const context = inject(NavigationContextService, { optional: true });
  if (!context) {
    throw new Error(
      `${injectorName} must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>`,
    );
  }
  return context;
}
