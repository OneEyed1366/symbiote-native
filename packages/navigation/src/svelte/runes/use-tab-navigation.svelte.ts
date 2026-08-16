// Twin of use-stack-navigation.svelte.ts, narrowing to a Tab handle instead.

import type { ITabNavigatorHandle } from '../../core';
import { isTabNavigatorHandle } from '../../core';
import { useNavigation } from './use-navigation.svelte';
import type { INavigationHandle } from './use-navigation.svelte';

export type ITabNavigationHandle = ITabNavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function useTabNavigation(): { readonly current: ITabNavigationHandle } {
  const navigation = useNavigation();
  const narrowed = $derived.by<ITabNavigationHandle>(() => {
    const value = navigation.current;
    if (!isTabNavigatorHandle(value)) {
      throw new Error(
        'useTabNavigation() was called from a component whose nearest navigator is not a Tab. ' +
          'Use useNavigation() instead if this component can render under more than one navigator kind.',
      );
    }
    return value;
  });

  return {
    get current(): ITabNavigationHandle {
      return narrowed;
    },
  };
}
