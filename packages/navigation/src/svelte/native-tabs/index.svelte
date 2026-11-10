<script lang="ts" module>
  // Screens come through the collector inside a collapsed `text`, as in Tab. The native host takes
  // only native screens as children, so the markers sit beside it and never inside it
  let nativeTabInstanceCounter = 0;

  const NATIVE_TAB_ROOT_PROPS: Record<string, unknown> = { style: { flex: 1 } };
</script>

<script lang="ts">
  import { Platform, dlog } from '@symbiote-native/engine';
  import {
    buildFixedRoutes,
    createEmitterStore,
    createInitialNativeTabState,
    nativeTabReducer,
    reconcileNativeTabRoutes,
    routeByKey,
  } from '../../core';
  import type { INativeTabAction, INativeTabState } from '../../core';
  import { planNativeTabs } from '../../core/native-tabs-renderer';
  import { createTabHandle } from '../../core/tab-handle';
  import { hostProps } from '../attachments';
  import { getNavigationScope } from '../navigation-context';
  import NavigationScope from '../navigation-scope.svelte';
  import { SCREEN_REGISTRY_HOST_PROPS } from '../registry-host';
  import { useScreenCollection } from '../screen-collection.svelte';
  import type { INativeTabScreenProps } from '../native-tab-screen-props';
  import type { INativeTabProps } from './native-tab-props';

  let {
    initialRouteName,
    screenOptions,
    bottomAccessory,
    children,
    ...host
  }: INativeTabProps = $props();

  // Read BEFORE this NativeTab sets its own scope, as it becomes the `parent` of its screens
  const parentScope = getNavigationScope();

  const routeIdPrefix = `native-tab-${(nativeTabInstanceCounter += 1)}`;

  const collection = useScreenCollection<INativeTabScreenProps['options']>(
    'nativeTab',
  );
  const registry = $derived(collection.registry);
  const registeredRoutes = $derived(buildFixedRoutes(registry, routeIdPrefix));

  // Only the dispatched half is state: the rest is reconciled against it on every change
  let dispatchedState = $state.raw<INativeTabState | null>(null);

  const state = $derived.by<INativeTabState>(() => {
    if (registeredRoutes.length === 0)
      dlog('NativeTab: no <NativeTab.Screen> children registered');
    const dispatched = dispatchedState;
    return dispatched === null
      ? createInitialNativeTabState(registeredRoutes, initialRouteName)
      : reconcileNativeTabRoutes(dispatched, registeredRoutes);
  });

  function dispatch(action: INativeTabAction): void {
    dispatchedState = nativeTabReducer(state, action);
  }

  const handle = createTabHandle(dispatch);
  export const { jumpTo, setParams } = handle;

  const { emitterFor } = createEmitterStore();

  const view = $derived(
    planNativeTabs(Platform, {
      registry,
      state,
      dispatch,
      handle,
      host,
      screenOptions,
      bottomAccessory,
      parent: undefined,
      emitterFor,
    }),
  );
</script>

<view p={NATIVE_TAB_ROOT_PROPS}>
  <text p={SCREEN_REGISTRY_HOST_PROPS}>
    {@render children?.()}
  </text>
  <svelte:element
    this={view.host.viewName}
    {@attach hostProps(view.host.props)}
  >
    {#each view.screens as { route, screen } (route.key)}
      {@const entry = registry.get(route.name)}
      {#if entry !== undefined}
        {@const RouteContent = entry.component}
        <svelte:element
          this={screen.viewName}
          {@attach hostProps(screen.props)}
        >
          <NavigationScope
            value={{
              route: routeByKey(state.routes, route.key),
              navigation: handle,
              emitter: emitterFor(route.key),
              parent: parentScope?.current,
            }}
          >
            <RouteContent />
          </NavigationScope>
        </svelte:element>
      {/if}
    {/each}
    {#if view.bottomAccessory !== undefined && bottomAccessory !== undefined}
      <svelte:element
        this={view.bottomAccessory.viewName}
        {@attach hostProps(view.bottomAccessory.props)}
      >
        {#each view.bottomAccessory.contents as content (content.environment)}
          <svelte:element
            this={content.viewName}
            {@attach hostProps(content.props)}
          >
            {@render bottomAccessory(content.environment)}
          </svelte:element>
        {/each}
      </svelte:element>
    {/if}
  </svelte:element>
</view>
