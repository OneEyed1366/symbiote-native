// The imperative handle of a tab navigator, over whatever `dispatch` the adapter's state offers

import type { ITabNavigatorHandle } from './navigator-handles';
import type { ITabRouterAction } from './tab-router-state';

export function createTabHandle(
  dispatch: (action: ITabRouterAction) => void,
): ITabNavigatorHandle {
  return {
    jumpTo: (name, params) => dispatch({ type: 'jumpTo', name, params }),
    setParams: (params, key) => dispatch({ type: 'setParams', key, params }),
  };
}
