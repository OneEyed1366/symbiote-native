<script lang="ts" module>
  // The tab bar is pure JS, painted from ordinary `view`/`text` by the shared render function, so
  // nothing from `../../register` is needed. Screens come through the collector, as in the stack
  let tabInstanceCounter = 0;

  const TAB_ROOT_PROPS: Record<string, unknown> = { style: { flex: 1 } };
  const TAB_CONTENT_PROPS: Record<string, unknown> = { style: { flex: 1 } };
</script>

<script lang="ts">
  import type { Component } from 'svelte';
  import { dlog } from '@symbiote-native/engine';
  import type { ShimElement } from '@symbiote-native/svelte/native-view-bridge';
  import {
    buildFixedRoutes,
    buildTabBarItems,
    createEmitterStore,
    createInitialTabState,
    createTabHandle,
    reconcileTabRoutes,
    renderTabBar,
    resolveFocusedTabOptions,
    tabRouterReducer,
  } from '../../core';
  import type {
    IDescriptor,
    ITabRouterAction,
    ITabRouterState,
  } from '../../core';
  import { createDescriptorSubtreeSync } from '../descriptor-subtree';
  import { getNavigationScope } from '../navigation-context';
  import type { INavigationScopeValue } from '../navigation-context';
  import NavigationScope from '../navigation-scope.svelte';
  import { SCREEN_REGISTRY_HOST_PROPS } from '../registry-host';
  import {
    setScreenCollector,
    toRegistry,
    withoutScreen,
  } from '../screen-registry';
  import type { IRegisteredScreen } from '../screen-registry';
  import { trackFocus } from '../track-focus.svelte';
  import type { ITabScreenProps } from '../tab-screen-props';
  import type { ITabProps } from './tab-props';

  let { initialRouteName, screenOptions, children }: ITabProps = $props();

  // Read BEFORE this Tab sets its own scope, as it becomes the `parent` of its screens
  const parentScope = getNavigationScope();

  const routeIdPrefix = `tab-${(tabInstanceCounter += 1)}`;

  let screens = $state.raw<IRegisteredScreen<ITabScreenProps['options']>[]>([]);
  setScreenCollector<ITabScreenProps['options']>({
    kind: 'tab',
    register: screen => {
      screens = [...screens, screen];
    },
    unregister: screen => {
      screens = withoutScreen(screens, screen);
    },
  });

  const registry = $derived(toRegistry(screens));

  // The routes are a projection of the registry, so a marker adding or dropping its tab changes
  // them. Keys come from the route name, so deriving again re-keys nothing
  const registeredRoutes = $derived(buildFixedRoutes(registry, routeIdPrefix));

  // Only the dispatched half is state: the rest is reconciled against it on every change
  let dispatchedState = $state.raw<ITabRouterState | null>(null);

  const state = $derived.by<ITabRouterState>(() => {
    if (registeredRoutes.length === 0)
      dlog('Tab: no <Tab.Screen> children registered');
    const dispatched = dispatchedState;
    return dispatched === null
      ? createInitialTabState(registeredRoutes, initialRouteName)
      : reconcileTabRoutes(dispatched, registeredRoutes);
  });

  function dispatch(action: ITabRouterAction): void {
    dispatchedState = tabRouterReducer(state, action);
  }

  const handle = createTabHandle(dispatch);
  export const { jumpTo, setParams } = handle;

  const { emitterFor } = createEmitterStore();
  trackFocus(() => state, emitterFor, 'Tab');

  const barInput = $derived({
    state,
    handle,
    entryFor: (name: string) => registry.get(name),
    optionsOf: (entry: IRegisteredScreen<ITabScreenProps['options']>) =>
      entry.options,
    screenOptions,
  });

  const tabBar = $derived.by<IDescriptor>(() =>
    renderTabBar({
      items: buildTabBarItems(barInput),
      style: resolveFocusedTabOptions(barInput)?.tabBarStyle,
      passthrough: {},
    }),
  );

  // Only the focused screen is mounted, so a fresh scope per focus change is enough: the previous
  // subtree and its listeners go with an ordinary unmount
  const focusedScreen = $derived.by<
    { scope: INavigationScopeValue; component: Component } | undefined
  >(() => {
    const focusedRoute = state.routes[state.index];
    if (focusedRoute === undefined) return undefined;
    const entry = registry.get(focusedRoute.name);
    if (entry === undefined) return undefined;
    return {
      component: entry.component,
      scope: {
        route: focusedRoute,
        navigation: handle,
        emitter: emitterFor(focusedRoute.key),
        parent: parentScope?.current,
      },
    };
  });

  // The root stays a literal tag so `bind:this` has a known one, and only the children go through
  // the bridge. Their count varies with the registry, hence the wrapper that tolerates a new shape
  let tabBarHost = $state.raw<ShimElement | null>(null);
  const syncTabBarChildren = createDescriptorSubtreeSync();
  $effect(() => {
    const host = tabBarHost;
    const barChildren = tabBar.children;
    syncTabBarChildren(host, barChildren);
  });
</script>

<view p={TAB_ROOT_PROPS}>
  <text p={SCREEN_REGISTRY_HOST_PROPS}>
    {@render children?.()}
  </text>
  <view p={TAB_CONTENT_PROPS}>
    {#if focusedScreen !== undefined}
      {@const FocusedComponent = focusedScreen.component}
      <NavigationScope value={focusedScreen.scope}>
        <FocusedComponent />
      </NavigationScope>
    {/if}
  </view>
  <view p={tabBar.props} bind:this={tabBarHost} />
</view>
