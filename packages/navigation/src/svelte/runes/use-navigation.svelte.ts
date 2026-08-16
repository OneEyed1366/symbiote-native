// Mirrors @react-navigation's `navigation.addListener('focus', cb)` surface; the Svelte twin of
// vue/composables/use-navigation.ts. All pub/sub logic lives in ../../core/navigation-events -
// this rune only reads the navigation scope off the context and binds identity.
//
// `.svelte.ts`, and a BOXED GETTER return (`{ get current() }`) rather than a bare value: runes
// are only usable outside a component in a `.svelte.ts` file, and Svelte 5 reactivity does not
// survive being returned as a plain value from a plain function (svelte-adapter-dom-shim skill
// §21). A caller reads `useNavigation().current` inside a `$derived`/template/`$effect`, exactly
// like unwrapping Vue's `ComputedRef` via `.value`.

import type { INavigationEventListener, INavigationEventName } from '../../core';
import { requireNavigationScope } from '../navigation-context';
import type { IAnyNavigatorHandle } from '../navigation-context';

export type INavigationHandle = IAnyNavigatorHandle & {
  addListener: (event: INavigationEventName, listener: INavigationEventListener) => () => void;
  // Walks exactly ONE hop up the scope's `parent` chain to the enclosing navigator's handle -
  // e.g. a Tab screen nested inside a Stack screen calling getParent() to push a new Stack route.
  // Callers narrow the union themselves ('push' in parent, etc.). Deliberately NOT
  // react-navigation's getParent(id) (named/targeted ancestor lookup) or a target-based dispatch
  // to a specific nested navigator by name - plain immediate-parent walking is v1 scope; multi-hop
  // ancestry would need each returned handle to carry its own getParent, which the plain
  // per-navigator handle types (INavigatorHandle/ITabNavigatorHandle/IDrawerNavigatorHandle) don't.
  getParent: () => IAnyNavigatorHandle | undefined;
};

export function useNavigation(): { readonly current: INavigationHandle } {
  const scope = requireNavigationScope('useNavigation');
  const handle = $derived.by<INavigationHandle>(() => {
    const { navigation, emitter, parent } = scope.current;
    return { ...navigation, addListener: emitter.addListener, getParent: () => parent?.navigation };
  });

  return {
    get current(): INavigationHandle {
      return handle;
    },
  };
}
