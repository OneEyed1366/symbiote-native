// The scope a list hands down to the lists nested in its cells, React's way to carry it
// What it holds and how it behaves is `createListNesting` in the shared components package

import {
  createContext,
  createElement,
  useContext,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { IListScope } from '@symbiote-native/components';

const VirtualizedListScope = createContext<IListScope | null>(null);

// Null outside every list, the scope of the nearest list above otherwise
export function useVirtualizedListScope(): IListScope | null {
  return useContext(VirtualizedListScope);
}

export function VirtualizedListScopeProvider(props: {
  scope: IListScope;
  children?: ReactNode;
}): ReactElement {
  return createElement(
    VirtualizedListScope.Provider,
    { value: props.scope },
    props.children,
  );
}

// A portal-like component (Modal) renders outside its parent list's scroll, so its content must
// not count itself as nested in it
export function VirtualizedListScopeResetter(props: {
  children?: ReactNode;
}): ReactElement {
  return createElement(
    VirtualizedListScope.Provider,
    { value: null },
    props.children,
  );
}
