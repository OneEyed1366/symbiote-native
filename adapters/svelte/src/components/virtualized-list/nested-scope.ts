// The scope a list hands down to the lists nested in its cells, Svelte's way to carry it
// What it holds and how it behaves is `createListNesting` in the shared components package

import { getContext, setContext } from 'svelte';
import type { IListScope } from '@symbiote-native/components';

const SCOPE_KEY = Symbol('virtualizedListScope');

// Null outside every list, the scope of the nearest list above otherwise
export function getVirtualizedListScope(): IListScope | null {
  return getContext<IListScope | null | undefined>(SCOPE_KEY) ?? null;
}

// A portal-like component (Modal) passes null, its content sits outside the list's scroll
export function setVirtualizedListScope(scope: IListScope | null): void {
  setContext(SCOPE_KEY, scope);
}
