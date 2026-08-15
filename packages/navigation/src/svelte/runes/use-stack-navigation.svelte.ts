// useNavigation() returns a union (IAnyNavigatorHandle) since it doesn't know which navigator
// mounted the calling component. When a component genuinely knows it only ever renders under a
// Stack, this rune narrows that union ONCE, here, so call sites never write their own
// 'push' in navigation check. Svelte twin of vue/composables/use-stack-navigation.ts.

import type { INavigatorHandle } from '../../core';
import { isStackNavigatorHandle } from '../../core';
import { useNavigation } from './use-navigation.svelte';
import type { INavigationHandle } from './use-navigation.svelte';

export type IStackNavigationHandle = INavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function useStackNavigation(): { readonly current: IStackNavigationHandle } {
  const navigation = useNavigation();
  const narrowed = $derived.by<IStackNavigationHandle>(() => {
    const value = navigation.current;
    if (!isStackNavigatorHandle(value)) {
      throw new Error(
        'useStackNavigation() was called from a component whose nearest navigator is not a Stack. ' +
          'Use useNavigation() instead if this component can render under more than one navigator kind.',
      );
    }
    return value;
  });

  return {
    get current(): IStackNavigationHandle {
      return narrowed;
    },
  };
}
