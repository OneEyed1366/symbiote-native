<script lang="ts" module>
  // Gaps vs the gesture-handler + reanimated drawer: no `configureGestureHandler`, no gesture
  // relationships against nested scrollers, `progress` lives on the JS thread, and the status bar
  // and keyboard options are unscoped
  let drawerInstanceCounter = 0;
</script>

<script lang="ts">
  import type { Component } from 'svelte';
  import {
    AnimatedValue,
    Dimensions,
    dlog,
    timing,
  } from '@symbiote-native/engine';
  import {
    buildDrawerDescriptors,
    buildFixedRoutes,
    createDrawerController,
    createEmitterStore,
    createInitialDrawerRouterState,
    drawerRouterReducer,
    findFocusedEntry,
    planDrawer,
  } from '../../core';
  import type {
    IDrawerOptions,
    IDrawerRouterAction,
    IDrawerRouterState,
    IDrawerSlotPlan,
  } from '../../core';
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
  import type { IDrawerScreenProps } from '../drawer-screen-props';
  import type { IDrawerProps } from './drawer-props';

  let {
    initialRouteName,
    drawerStyle,
    drawerType,
    drawerPosition,
    drawerWidth,
    overlayColor,
    swipeEnabled,
    swipeEdgeWidth,
    swipeMinDistance,
    swipeMinVelocity,
    children,
    drawerContent,
  }: IDrawerProps = $props();

  // Read BEFORE this Drawer sets its own scope, as it becomes the `parent` of its screens
  const parentScope = getNavigationScope();

  const routeIdPrefix = `drawer-${(drawerInstanceCounter += 1)}`;

  const options = $derived<IDrawerOptions>({
    drawerType,
    drawerPosition,
    drawerWidth,
    overlayColor,
    swipeEnabled,
    swipeEdgeWidth,
    swipeMinDistance,
    swipeMinVelocity,
  });

  let screens = $state.raw<IRegisteredScreen<IDrawerScreenProps['options']>[]>(
    [],
  );
  setScreenCollector<IDrawerScreenProps['options']>({
    kind: 'drawer',
    register: screen => {
      screens = [...screens, screen];
    },
    unregister: screen => {
      screens = withoutScreen(screens, screen);
    },
  });

  const registry = $derived(toRegistry(screens));

  // Seeded from the registry until the first dispatch freezes it
  let dispatchedState = $state.raw<IDrawerRouterState | null>(null);

  const state = $derived.by<IDrawerRouterState>(() => {
    if (dispatchedState !== null) return dispatchedState;
    const routes = buildFixedRoutes(registry, routeIdPrefix);
    if (routes.length === 0)
      dlog('Drawer: no <Drawer.Screen> children registered');
    return createInitialDrawerRouterState(routes, initialRouteName);
  });

  function dispatch(action: IDrawerRouterAction): void {
    dispatchedState = drawerRouterReducer(state, action);
  }

  // The window width is read at gesture time: it is never rendered, so a live read is simpler and
  // more current than a subscription
  const { progress, handle, panResponder } = createDrawerController({
    animated: { Value: AnimatedValue, timing },
    readState: () => state,
    dispatch,
    readOptions: () => options,
    readWindowWidth: () => Dimensions.get('window').width,
  });

  export const { openDrawer, closeDrawer, toggleDrawer, jumpTo } = handle;

  const { emitterFor } = createEmitterStore();
  trackFocus(() => state, emitterFor, 'Drawer');

  const focusedScreen = $derived.by<
    { scope: INavigationScopeValue; component: Component } | undefined
  >(() => {
    const focused = findFocusedEntry(state, name => registry.get(name));
    if (focused === undefined) return undefined;
    return {
      component: focused.entry.component,
      scope: {
        route: focused.route,
        navigation: handle,
        emitter: emitterFor(focused.route.key),
        parent: parentScope?.current,
      },
    };
  });

  const descriptors = $derived(
    buildDrawerDescriptors({
      state,
      handle,
      entryFor: name => registry.get(name),
      optionsOf: entry => entry.options,
    }),
  );

  const plan = $derived(
    planDrawer({
      state,
      options,
      drawerStyle,
      progress,
      closeDrawer: handle.closeDrawer,
    }),
  );

  const rootProps = $derived<Record<string, unknown>>({
    style: plan.rootStyle,
    ...panResponder.panHandlers,
  });

  // The animated style only joins a slot when the drawer animates
  function slotProps(slotPlan: IDrawerSlotPlan): Record<string, unknown> {
    const { descriptor, animatedStyle } = slotPlan;
    if (animatedStyle === undefined) return descriptor.props;
    return {
      ...descriptor.props,
      style: [descriptor.props.style, animatedStyle],
    };
  }
</script>

{#snippet screenContent()}
  {#if focusedScreen !== undefined}
    {@const FocusedComponent = focusedScreen.component}
    <NavigationScope value={focusedScreen.scope}>
      <FocusedComponent />
    </NavigationScope>
  {/if}
{/snippet}

<view p={rootProps}>
  <text p={SCREEN_REGISTRY_HOST_PROPS}>
    {@render children?.()}
  </text>
  {#each plan.slots as slotPlan (slotPlan.slot)}
    {#if slotPlan.slot === 'content'}
      <view p={slotProps(slotPlan)}>
        {@render screenContent()}
      </view>
    {:else if slotPlan.slot === 'overlay'}
      <view p={slotProps(slotPlan)} />
    {:else}
      <view p={slotProps(slotPlan)}>
        {@render drawerContent?.({
          state,
          descriptors,
          navigation: handle,
        })}
      </view>
    {/if}
  {/each}
</view>
