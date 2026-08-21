// Mirrors @react-navigation's `navigation.addListener('focus', cb)` surface. All pub/sub logic
// lives in ../../core/navigation-events; this only reads the injected scope and binds identity.
//
// `use*`, not `create*`: it CONSUMES an existing context and owns no state or subscription of its
// own - the same distinction Solid itself draws between `useContext`/`useTransition` and
// `createSignal`/`createEffect` (adapters/solid/src/primitives/create-color-scheme.ts's header).
//
// Returns an ACCESSOR for the reason every value crossing a boundary in this adapter does: a Solid
// component body runs once, so a returned object would freeze at the scope the screen mounted with
// and `getParent()` would keep answering with a stale ancestor after a nested navigator re-scoped.

import { createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';
import type {
  INavigationEventListener,
  INavigationEventName,
} from '../../core';
import { requireNavigationScope } from '../navigation-context';
import type { IAnyNavigatorHandle } from '../navigation-context';

export type INavigationHandle = IAnyNavigatorHandle & {
  addListener: (
    event: INavigationEventName,
    listener: INavigationEventListener,
  ) => () => void;
  // Walks exactly ONE hop up the scope's `parent` chain to the enclosing navigator's handle - e.g.
  // a Tab screen nested inside a Stack screen calling getParent() to push a new Stack route.
  // Callers narrow the union themselves ('push' in parent, etc.). Deliberately NOT
  // react-navigation's getParent(id) or a target-based dispatch by navigator name - plain
  // immediate-parent walking is v1 scope on every adapter.
  getParent: () => IAnyNavigatorHandle | undefined;
};

export function useNavigation(): Accessor<INavigationHandle> {
  const scope = requireNavigationScope('useNavigation');
  return createMemo(() => {
    const { navigation, emitter, parent } = scope();
    return {
      ...navigation,
      addListener: emitter.addListener,
      getParent: () => parent?.navigation,
    };
  });
}
