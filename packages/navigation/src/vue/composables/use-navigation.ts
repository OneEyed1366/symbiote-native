// Thin lifecycle wrapper: returns the current screen's navigator handle (push/pop/replace/… for a
// Stack screen, jumpTo/setParams for a Tab screen, openDrawer/… for a Drawer screen) plus
// addListener bound to that route's own emitter — mirrors @react-navigation's
// `navigation.addListener('focus', cb)` surface. All pub/sub logic lives in
// ../../core/navigation-events; this composable only reads the injected navigation scope and
// binds identity. The Vue twin of react/hooks/use-navigation.ts, returning a ComputedRef instead
// of a plain value (Vue's reactive-primitive convention — see useColorScheme/useWindowDimensions).

import { computed } from '@vue/runtime-core';
import type { ComputedRef } from '@vue/runtime-core';
import type { INavigationEventListener, INavigationEventName } from '../../core';
import { requireNavigationScope } from '../navigation-context';
import type { IAnyNavigatorHandle } from '../navigation-context';

export type INavigationHandle = IAnyNavigatorHandle & {
  addListener: (event: INavigationEventName, listener: INavigationEventListener) => () => void;
  // Walks exactly ONE hop up the scope's `parent` chain to the enclosing navigator's handle —
  // e.g. a Tab screen nested inside a Stack screen calling getParent() to push a new Stack route.
  // Callers narrow the union themselves ('push' in parent, etc.). Deliberately NOT
  // react-navigation's getParent(id) (named/targeted ancestor lookup) or a target-based dispatch
  // to a specific nested navigator by name — plain immediate-parent walking is v1 scope; multi-hop
  // ancestry would need each returned handle to carry its own getParent, which the plain
  // per-navigator handle types (INavigatorHandle/ITabNavigatorHandle/IDrawerNavigatorHandle) don't.
  getParent: () => IAnyNavigatorHandle | undefined;
};

export function useNavigation(): ComputedRef<INavigationHandle> {
  const scope = requireNavigationScope('useNavigation');
  return computed(() => {
    const { navigation, emitter, parent } = scope.value;
    return { ...navigation, addListener: emitter.addListener, getParent: () => parent?.navigation };
  });
}
