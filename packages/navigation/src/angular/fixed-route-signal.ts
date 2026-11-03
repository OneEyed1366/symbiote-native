// Stored state of a fixed-list navigator (Tab, NativeTab), reconciled with the live marker query
// The writes live in `sync` and `dispatch`, as a signal write inside a computed is an error

import { DestroyRef, inject, signal } from '@angular/core';
import type { QueryList, Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { dlog } from '@symbiote-native/engine';
import { buildFixedRoutes } from '../core';
import type { IFixedRouter } from '../core';

type IMarker = { name: string; initialParams?: unknown };

// Called from a field initializer, as it injects the `DestroyRef` that ends the query subscription
export function createFixedRouteSignal<TState, TAction>(
  router: IFixedRouter<TState, TAction>,
  routeIdPrefix: string,
  emptyMessage: string,
): {
  state: Signal<TState | undefined>;
  follow: <TScreen extends IMarker>(
    query: QueryList<TScreen>,
    registry: Map<string, TScreen>,
    initialRouteName: () => string | undefined,
  ) => void;
  dispatch: (action: TAction) => void;
} {
  const stored = signal<TState | undefined>(undefined);
  const destroyRef = inject(DestroyRef);

  // A marker can appear or leave after mount, a survivor keeps its key and params
  function sync(
    registry: ReadonlyMap<string, IMarker>,
    initialRouteName: string | undefined,
  ): void {
    const routes = buildFixedRoutes(registry, routeIdPrefix);
    if (routes.length === 0) dlog(emptyMessage);
    const current = stored();
    if (current !== undefined) {
      stored.set(router.reconcile(current, routes));
      return;
    }
    // Seeding an empty list would lose `initialRouteName`, so wait for the first marker
    if (routes.length === 0) return;
    stored.set(router.create(routes, initialRouteName));
  }

  return {
    state: stored.asReadonly(),
    // The map holds the LIVE directives, so an in-place `[options]` rebind stays visible through it
    follow: (query, registry, initialRouteName) => {
      const refill = (): void => {
        registry.clear();
        for (const screen of query) registry.set(screen.name, screen);
        sync(registry, initialRouteName());
      };
      refill();
      query.changes.pipe(takeUntilDestroyed(destroyRef)).subscribe(refill);
    },
    dispatch: action => {
      const current = stored();
      if (current === undefined) return;
      stored.set(router.reduce(current, action));
    },
  };
}
