// The scope a list hands down to the lists nested in its cells, Vue's way to carry it
// What it holds and how it behaves is `createListNesting` in the shared components package

import { inject, provide, type InjectionKey } from '@vue/runtime-core';
import type { IListScope } from '@symbiote-native/components';

const SCOPE_KEY: InjectionKey<IListScope | null> = Symbol(
  'virtualizedListScope',
);

// Null outside every list, the scope of the nearest list above otherwise
export function useVirtualizedListScope(): IListScope | null {
  return inject(SCOPE_KEY, null);
}

// A portal-like component (Modal) passes null, its content sits outside the list's scroll
export function provideVirtualizedListScope(scope: IListScope | null): void {
  provide(SCOPE_KEY, scope);
}
