// useNavigation() returns a union (IAnyNavigatorHandle), since it does not know which navigator
// mounted the calling component. When a component genuinely only ever renders under a Stack, this
// narrows that union ONCE, here, so call sites never write their own `'push' in navigation` check.
//
// `use*`: a pure consumer of useNavigation()'s accessor, no state of its own.

import { createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';
import { isStackNavigatorHandle } from '../../core';
import type { INavigatorHandle } from '../../core';
import { useNavigation } from './use-navigation';
import type { INavigationHandle } from './use-navigation';

export type IStackNavigationHandle = INavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function useStackNavigation(): Accessor<IStackNavigationHandle> {
  const navigation = useNavigation();
  return createMemo(() => {
    const value = navigation();
    if (!isStackNavigatorHandle(value)) {
      throw new Error(
        'useStackNavigation() was called from a component whose nearest navigator is not a Stack. ' +
          'Use useNavigation() instead if this component can render under more than one navigator kind.',
      );
    }
    return value;
  });
}
