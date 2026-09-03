// Twin of use-stack-navigation.ts, narrowing to a Tab handle instead.

import { createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';
import { isTabNavigatorHandle } from '../../core';
import type { ITabNavigatorHandle } from '../../core';
import { useNavigation } from './use-navigation';
import type { INavigationHandle } from './use-navigation';

export type ITabNavigationHandle = ITabNavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function useTabNavigation(): Accessor<ITabNavigationHandle> {
  const navigation = useNavigation();
  return createMemo(() => {
    const value = navigation();
    if (!isTabNavigatorHandle(value)) {
      throw new Error(
        'useTabNavigation() was called from a component whose nearest navigator is not a Tab. ' +
          'Use useNavigation() instead if this component can render under more than one navigator kind.',
      );
    }
    return value;
  });
}
