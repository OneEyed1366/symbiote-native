// Route bookkeeping shared by the fixed-list navigators (Tab, Drawer): keys, lookup and the
// focus/blur events of the focused route

import { dlog } from '@symbiote-native/engine';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  diffFocusedRoute,
} from './navigation-events';
import type { INavigationEmitter } from './navigation-events';
import type { IRoute } from './navigator-state';

// Keys come from the screen NAME, so the derivation is pure and can run again
export function buildFixedRoutes(
  registry: ReadonlyMap<string, { initialParams?: unknown }>,
  routeIdPrefix: string,
): IRoute<unknown>[] {
  return [...registry.entries()].map(([name, entry]) => ({
    key: `${routeIdPrefix}-${name}`,
    name,
    params: entry.initialParams,
  }));
}

// A route that left the list may still render for a frame, so a miss gives a placeholder
export function routeByKey(
  routes: readonly IRoute<unknown>[],
  routeKey: string,
): IRoute<unknown> {
  const found = routes.find(route => route.key === routeKey);
  return found ?? { key: routeKey, name: '', params: undefined };
}

// Emits blur, then focus, when the focused route key changes. The emit is deferred, a microtask by
// default: the new screen's subtree is built by the flush that calls `update`, so its
// subscriptions are not there yet inside it
export function createFocusTracker(
  emitterFor: (routeKey: string) => INavigationEmitter,
  label: string,
  defer: (task: () => void) => unknown = queueMicrotask,
) {
  let lastFocusedKey: string | undefined;
  return {
    update(nextKey: string | undefined): void {
      const { blurKey, focusKey } = diffFocusedRoute(lastFocusedKey, nextKey);
      if (blurKey === undefined && focusKey === undefined) return;
      lastFocusedKey = nextKey;
      defer(() => {
        if (blurKey !== undefined) {
          dlog(`${label}: route "${blurKey}" blurred at t=${Date.now()}`);
          emitterFor(blurKey).emit(NAVIGATION_EVENT_BLUR);
        }
        if (focusKey !== undefined) {
          dlog(`${label}: route "${focusKey}" focused at t=${Date.now()}`);
          emitterFor(focusKey).emit(NAVIGATION_EVENT_FOCUS);
        }
      });
    },
    // The last focused screen gets its blur when the navigator itself goes away
    dispose(): void {
      if (lastFocusedKey !== undefined)
        emitterFor(lastFocusedKey).emit(NAVIGATION_EVENT_BLUR);
    },
  };
}
