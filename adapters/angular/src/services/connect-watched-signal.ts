// A signal fed by a `watch` subscription that lives as long as the injector's owner

import { effect, signal, type Injector, type Signal } from '@angular/core';

export function connectWatchedSignal<T>(
  injector: Injector,
  initial: T,
  watch: (set: (value: T) => void) => () => void,
): Signal<T> {
  const value = signal(initial);

  effect(onCleanup => onCleanup(watch(next => value.set(next))), { injector });

  return value.asReadonly();
}
