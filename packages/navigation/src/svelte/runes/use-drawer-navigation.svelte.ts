// Twin of use-stack-navigation.svelte.ts, narrowing to a Drawer handle instead.

import type { IDrawerNavigatorHandle } from '../../core';
import { isDrawerNavigatorHandle } from '../../core';
import { useNavigation } from './use-navigation.svelte';
import type { INavigationHandle } from './use-navigation.svelte';

export type IDrawerNavigationHandle = IDrawerNavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function useDrawerNavigation(): { readonly current: IDrawerNavigationHandle } {
  const navigation = useNavigation();
  const narrowed = $derived.by<IDrawerNavigationHandle>(() => {
    const value = navigation.current;
    if (!isDrawerNavigatorHandle(value)) {
      throw new Error(
        'useDrawerNavigation() was called from a component whose nearest navigator is not a Drawer. ' +
          'Use useNavigation() instead if this component can render under more than one navigator kind.',
      );
    }
    return value;
  });

  return {
    get current(): IDrawerNavigationHandle {
      return narrowed;
    },
  };
}
