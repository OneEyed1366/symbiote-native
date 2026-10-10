// The scope a list hands down to the lists nested in its cells, Angular's way to carry it
// What it holds and how it behaves is `createListNesting` in the shared components package

import { inject } from '@angular/core';
import type { IListScope } from '@symbiote-native/components';

// A list provides itself under this token, a cell declared inside it injects the nearest one
export abstract class ListScopeProvider {
  abstract readonly listScope: IListScope | null;
}

// A portal-like component (Modal) provides this, its content sits outside the list's scroll
export const NO_LIST_SCOPE: ListScopeProvider = { listScope: null };

// Null outside every list, the scope of the nearest list above otherwise
export function injectVirtualizedListScope(): IListScope | null {
  const provider = inject(ListScopeProvider, {
    skipSelf: true,
    optional: true,
  });
  return provider?.listScope ?? null;
}
