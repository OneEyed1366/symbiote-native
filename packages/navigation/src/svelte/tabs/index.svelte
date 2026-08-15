<script lang="ts" module>
  // Tab, the Svelte lifecycle half. The focused-index router (tab-router-state) and the tab-bar
  // Descriptor builder (render-tabs) live in @symbiote-native/navigation core, shared verbatim
  // with the React/Vue/Angular entries; here Svelte supplies the lifecycle - `$state.raw` for the
  // router (its twin of useReducer), a module counter for route-key generation, `export
  // function`s for the jumpTo/setParams handle - plus the Descriptor bridge for the tab-bar leaf.
  // Unlike Stack, a bottom-tabs bar is a PURE-JS UI: it paints ordinary `symbiote-view`/
  // `symbiote-text` primitives via the shared render fn, so there is no react-native-screens
  // ViewConfig to register here - Tab needs no `../../register` import.
  //
  // Screens are discovered through the context collector (../screen-registry.ts), not by reading
  // `children` - see stack/index.svelte's header for why, and ../registry-host.ts for where the
  // markers are rendered.
  let tabInstanceCounter = 0;

  const TAB_ROOT_PROPS: Record<string, unknown> = { style: { flex: 1 } };
  const TAB_CONTENT_PROPS: Record<string, unknown> = { style: { flex: 1 } };
</script>

<script lang="ts">
  import type { Component } from 'svelte';
  import { onDestroy, tick } from 'svelte';
  import { dlog } from '@symbiote-native/engine';
  import type { ShimElement } from '@symbiote-native/svelte/native-view-bridge';
  import {
    NAVIGATION_EVENT_BLUR,
    NAVIGATION_EVENT_FOCUS,
    createInitialTabState,
    createNavigationEmitter,
    diffFocusedRoute,
    isFocusedRoute,
    renderTabBar,
    tabRouterReducer,
  } from '../../core';
  import type {
    IDescriptor,
    INavigationEmitter,
    IRoute,
    ITabBarItemView,
    ITabNavigatorHandle,
    ITabOptions,
    ITabRouterAction,
    ITabRouterState,
  } from '../../core';
  import { createDescriptorSubtreeSync } from '../descriptor-subtree';
  import { getNavigationScope } from '../navigation-context';
  import type { INavigationScopeValue } from '../navigation-context';
  import NavigationScope from '../navigation-scope.svelte';
  import { SCREEN_REGISTRY_HOST_PROPS } from '../registry-host';
  import { setScreenCollector, toRegistry, withoutScreen } from '../screen-registry';
  import type { IRegisteredScreen } from '../screen-registry';
  import type { ITabScreenProps } from '../tab-screen-props';
  import type { ITabProps } from './tab-props';

  let { initialRouteName, screenOptions, children }: ITabProps = $props();

  // Read BEFORE this Tab establishes its own per-screen NavigationScope - becomes the `parent`
  // link a nested screen's useNavigation().getParent() walks. undefined at the nesting root.
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

  // Same seed-once-then-dispatch shape Stack uses: the router state cannot exist until the
  // markers have registered, and `seededState` is a plain local so memoizing it inside the
  // derivation is not a state write during a derivation.
  let dispatchedState = $state.raw<ITabRouterState | null>(null);
  let seededState: ITabRouterState | undefined;

  function seedState(): ITabRouterState {
    if (seededState !== undefined) return seededState;
    const routes: IRoute<unknown>[] = [...registry.entries()].map(([name, entry]) => ({
      key: `${routeIdPrefix}-${name}`,
      name,
      params: entry.initialParams,
    }));
    if (routes.length === 0) {
      dlog('Tab: no <Tab.Screen> children registered');
      // Deliberately not memoized - markers may still be registering.
      return createInitialTabState(routes, initialRouteName);
    }
    seededState = createInitialTabState(routes, initialRouteName);
    return seededState;
  }

  const state = $derived(dispatchedState ?? seedState());

  function dispatch(action: ITabRouterAction): void {
    dispatchedState = tabRouterReducer(state, action);
  }

  export function jumpTo(name: string, params?: unknown): void {
    dispatch({ type: 'jumpTo', name, params });
  }
  export function setParams(params: unknown, key: string): void {
    dispatch({ type: 'setParams', key, params });
  }

  const handle: ITabNavigatorHandle = { jumpTo, setParams };

  // One emitter per route.key, created lazily and cached for the navigator's whole lifetime -
  // mirrors Stack's own `emitters` map. This decouples emitter IDENTITY (stable, looked up by
  // key, read below when a route's NavigationScope is built) from emit TIMING (must wait until
  // the focused screen has actually mounted and subscribed).
  const emitters = new Map<string, INavigationEmitter>();
  function emitterFor(routeKey: string): INavigationEmitter {
    let emitter = emitters.get(routeKey);
    if (emitter === undefined) {
      emitter = createNavigationEmitter();
      emitters.set(routeKey, emitter);
    }
    return emitter;
  }

  // Tab paints its own bar in pure JS - there is no native onAppear/onDisappear to hook (unlike
  // Stack's RNSScreen), so focus/blur is synthesized here. Keyed on the route KEY (not the route
  // object) so a setParams-only change doesn't spuriously re-fire focus/blur.
  //
  // The bookkeeping updates immediately, but the actual emit is deferred to `tick()` - Svelte's
  // twin of Vue's nextTick, and needed for the same reason: the newly-focused screen's own
  // `$effect`s (its useIsFocused/useFocusEffect subscriptions) are created during THIS flush,
  // after this effect was, so emitting synchronously here would reach zero subscribers.
  let previousFocusedKey: string | undefined;
  $effect(() => {
    const nextKey = state.routes[state.index]?.key;
    const { blurKey, focusKey } = diffFocusedRoute(previousFocusedKey, nextKey);
    if (blurKey === undefined && focusKey === undefined) return;
    previousFocusedKey = nextKey;
    void tick().then(() => {
      if (blurKey !== undefined) {
        dlog(`Tab: route "${blurKey}" blurred at t=${Date.now()}`);
        emitterFor(blurKey).emit(NAVIGATION_EVENT_BLUR);
      }
      if (focusKey !== undefined) {
        dlog(`Tab: route "${focusKey}" focused at t=${Date.now()}`);
        emitterFor(focusKey).emit(NAVIGATION_EVENT_FOCUS);
      }
    });
  });

  onDestroy(() => {
    if (previousFocusedKey !== undefined) {
      emitterFor(previousFocusedKey).emit(NAVIGATION_EVENT_BLUR);
    }
  });

  function resolveTabOptions(
    entry: IRegisteredScreen<ITabScreenProps['options']> | undefined,
    route: IRoute<unknown>,
  ): ITabOptions {
    const own =
      entry === undefined
        ? undefined
        : typeof entry.options === 'function'
          ? entry.options({ route, navigation: handle })
          : entry.options;
    return { ...screenOptions, ...own };
  }

  const items = $derived.by<ITabBarItemView[]>(() =>
    state.routes.map((route, index) => {
      const entry = registry.get(route.name);
      const focused = isFocusedRoute(index, state.index);
      if (entry === undefined) {
        dlog(`Tab: no screen registered for route name "${route.name}"`);
        return { key: route.key, focused, label: route.name, passthrough: {} };
      }
      const options = resolveTabOptions(entry, route);
      return {
        key: route.key,
        focused,
        label: options.tabBarLabel ?? options.title ?? route.name,
        icon: options.tabBarIcon,
        badge: options.tabBarBadge,
        activeTintColor: options.tabBarActiveTintColor,
        inactiveTintColor: options.tabBarInactiveTintColor,
        passthrough: {
          onPress: () => jumpTo(route.name),
          accessibilityRole: 'tab',
          accessibilityState: { selected: focused },
        },
      };
    }),
  );

  const focusedRoute = $derived(state.routes[state.index]);
  const focusedOptions = $derived(
    focusedRoute === undefined
      ? screenOptions
      : resolveTabOptions(registry.get(focusedRoute.name), focusedRoute),
  );

  const tabBar = $derived.by<IDescriptor>(() =>
    renderTabBar({ items, style: focusedOptions?.tabBarStyle, passthrough: {} }),
  );

  // Only the focused route's screen is ever mounted (unlike Stack, which keeps every pushed route
  // alive), so a fresh NavigationScope per focus change is sufficient - the previous screen's
  // whole subtree (and any listeners it registered) is torn down by an ordinary unmount when
  // focus moves on.
  const focusedScreen = $derived.by<{ scope: INavigationScopeValue; component: Component } | undefined>(
    () => {
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
    },
  );

  // The bar's ROOT stays a literal template tag (so `bind:this` has a statically known tag) and
  // only its children go through the Descriptor bridge - the uniform shape every Svelte component
  // consuming a `render-*.ts` uses (svelte-adapter-dom-shim skill §19). The item count varies with
  // the registry, hence the shape-change-tolerant wrapper rather than the raw bridge.
  let tabBarHost = $state.raw<ShimElement | null>(null);
  const syncTabBarChildren = createDescriptorSubtreeSync();
  $effect(() => {
    const host = tabBarHost;
    const barChildren = tabBar.children;
    syncTabBarChildren(host, barChildren);
  });
</script>

<symbiote-view p={TAB_ROOT_PROPS}><symbiote-text p={SCREEN_REGISTRY_HOST_PROPS}>{@render children?.()}</symbiote-text><symbiote-view p={TAB_CONTENT_PROPS}>{#if focusedScreen !== undefined}{@const FocusedComponent = focusedScreen.component}<NavigationScope value={focusedScreen.scope}><FocusedComponent /></NavigationScope>{/if}</symbiote-view><symbiote-view p={tabBar.props} bind:this={tabBarHost}></symbiote-view></symbiote-view>
