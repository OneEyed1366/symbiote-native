import { DestroyRef, inject, signal } from '@angular/core';
import type { Signal } from '@angular/core';

// Angular twin of `useSyncExternalStore`: the signal follows the store until the owner is destroyed
export function injectExternalStore<T>(
  subscribe: (listener: () => void) => () => void,
  read: () => T,
): Signal<T> {
  const state = signal<T>(read());
  inject(DestroyRef).onDestroy(subscribe(() => state.set(read())));
  return state.asReadonly();
}
