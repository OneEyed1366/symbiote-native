import {
  Injector,
  computed,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import type { Signal } from '@angular/core';

// A hook that reads a required input at creation has to wait until the inputs are bound.
// Call this in a field initializer, then `connect` from `ngOnInit`
export function bindAfterInputs<T>() {
  const injector = inject(Injector);
  const source = signal<Signal<T> | null>(null);
  return {
    value: computed(() => source()?.() ?? null),
    connect: (create: () => Signal<T>): void => {
      source.set(runInInjectionContext(injector, create));
    },
  };
}
