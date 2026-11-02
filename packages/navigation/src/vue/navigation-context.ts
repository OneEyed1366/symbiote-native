// Vue has no Context, so a screen's route, navigator handle and emitter travel by provide/inject
// `NavigationScope` mounts once per route, as `provide()` is scoped to a component instance

import {
  defineComponent,
  inject,
  provide,
  shallowRef,
} from '@vue/runtime-core';
import type { InjectionKey, ShallowRef } from '@vue/runtime-core';
import type {
  IEdgeInsetState,
  INavigationEmitter,
  IRoute,
  IAnyNavigatorHandle,
  ITransitionProgress,
} from '../core';
export type { IAnyNavigatorHandle };

export type INavigationScopeValue = {
  route: IRoute<unknown>;
  navigation: IAnyNavigatorHandle;
  emitter: INavigationEmitter;
  // Only a Stack route has one, as native sends transition events for stack screens alone
  transitionProgress?: ITransitionProgress;
  // The insets this screen's header took, a nested header reads them up the `parent` chain
  edgeInsets?: IEdgeInsetState;
  // Links the enclosing screen's scope, so `getParent()` reaches a navigator above
  parent?: INavigationScopeValue;
};

const NAVIGATION_SCOPE_KEY: InjectionKey<ShallowRef<INavigationScopeValue>> =
  Symbol('navigation-scope');

// Writes the current route's scope onto the shared key, called from `NavigationScope` setup only
function provideNavigationScope(
  value: ShallowRef<INavigationScopeValue>,
): void {
  provide(NAVIGATION_SCOPE_KEY, value);
}

// Undefined means no ancestor scope, which is the nesting root and not an error
export function injectNavigationScope():
  ShallowRef<INavigationScopeValue> | undefined {
  return inject(NAVIGATION_SCOPE_KEY, undefined);
}

// The throw every composable shares, so a wording change lands once
export function requireNavigationScope(
  hookName: string,
): ShallowRef<INavigationScopeValue> {
  const scope = injectNavigationScope();
  if (scope === undefined) {
    throw new Error(
      `${hookName} must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>`,
    );
  }
  return scope;
}

// `props: ['value']` must stay declared, else Vue routes `value` into attrs
// and the refresh below keeps reading a stale snapshot
export const NavigationScope = defineComponent<{
  value: INavigationScopeValue;
}>(
  (props, { slots }) => {
    const current = shallowRef(props.value);
    provideNavigationScope(current);
    return () => {
      current.value = props.value;
      return slots.default?.() ?? null;
    };
  },
  { name: 'NavigationScope', props: ['value'] },
);
