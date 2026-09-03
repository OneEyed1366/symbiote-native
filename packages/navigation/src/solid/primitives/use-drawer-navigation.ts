// Twin of use-stack-navigation.ts, narrowing to a Drawer handle instead.

import { createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';
import { isDrawerNavigatorHandle } from '../../core';
import type { IDrawerNavigatorHandle } from '../../core';
import { useNavigation } from './use-navigation';
import type { INavigationHandle } from './use-navigation';

export type IDrawerNavigationHandle = IDrawerNavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function useDrawerNavigation(): Accessor<IDrawerNavigationHandle> {
  const navigation = useNavigation();
  return createMemo(() => {
    const value = navigation();
    if (!isDrawerNavigatorHandle(value)) {
      throw new Error(
        'useDrawerNavigation() was called from a component whose nearest navigator is not a Drawer. ' +
          'Use useNavigation() instead if this component can render under more than one navigator kind.',
      );
    }
    return value;
  });
}
