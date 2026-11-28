// Mirrors @react-navigation's `navigation.addListener('focus', cb)` surface; the Svelte twin of
// vue/composables/use-navigation.ts. All pub/sub logic lives in ../../core/navigation-events -
// this rune only reads the navigation scope off the context and binds identity.
//
// `.svelte.ts` and a boxed getter return (`{ get current() }`), as runes work outside a component
// only in such a file and Svelte 5 reactivity does not survive a plain returned value
// Read `useNavigation().current` inside `$derived`, a template or `$effect`, like Vue's `.value`

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
  // Walks one hop up the `parent` chain to the enclosing navigator's handle, narrowed by callers
  // Not react-navigation's `getParent(id)`: multi-hop ancestry would need each returned handle
  // to carry its own `getParent`, which the per-navigator handle types do not
  getParent: () => IAnyNavigatorHandle | undefined;
};

export function useNavigation(): { readonly current: INavigationHandle } {
  const scope = requireNavigationScope('useNavigation');
  const handle = $derived.by<INavigationHandle>(() => {
    const { navigation, emitter, parent } = scope.current;
    return {
      ...navigation,
      addListener: emitter.addListener,
      getParent: () => parent?.navigation,
    };
  });

  return {
    get current(): INavigationHandle {
      return handle;
    },
  };
}
