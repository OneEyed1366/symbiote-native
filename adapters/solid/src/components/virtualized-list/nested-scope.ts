// The scope a list hands down to the lists nested in its cells, Solid's way to carry it
// What it holds and how it behaves is `createListNesting` in the shared components package

import { createContext, useContext } from 'solid-js';
import type { IListScope } from '@symbiote-native/components';
import type { JSX } from '../../jsx-runtime';

const ListScope = createContext<IListScope | null>(null);

// Null outside every list, the scope of the nearest list above otherwise
export function useVirtualizedListScope(): IListScope | null {
  return useContext(ListScope);
}

// Called as a function, the Provider's children are built with the scope in their owner chain
export function provideVirtualizedListScope(
  scope: IListScope | null,
  build: () => JSX.Element,
): JSX.Element {
  return ListScope.Provider({
    value: scope,
    get children() {
      return build();
    },
  });
}

// A portal-like component (Modal) passes null, its content sits outside the list's scroll
export function VirtualizedListScopeResetter(props: {
  children?: JSX.Element;
}): JSX.Element {
  return provideVirtualizedListScope(null, () => props.children);
}
