<script lang="ts" module>
  // Screens are not read from `children` (an opaque Snippet): the markers register themselves
  // through the collector, inside a collapsed `text` so whitespace never becomes raw text

  // Route keys are unique per Stack instance and Svelte has no `useId`, so a counter stands in
  let stackInstanceCounter = 0;

  const STACK_ROOT_PROPS: Record<string, unknown> = { style: { flex: 1 } };
</script>

<script lang="ts">
  import type { Component } from 'svelte';
  import { dlog } from '@symbiote-native/engine';
  import {
    RNS_SCREEN_STACK_VIEW_NAME,
    buildInitialState,
    buildStackHostProps,
    createEmitterStore,
    createRouteFactory,
    createStackHandle,
    mergeScreenOptions,
    navigatorReducer,
    reconcileStackRoutes,
  } from '../../core';
  import type { INavigatorAction, INavigatorState, IRoute } from '../../core';
  import { hostProps } from '../attachments';
  import { getNavigationScope } from '../navigation-context';
  import { SCREEN_REGISTRY_HOST_PROPS } from '../registry-host';
  import {
    setScreenCollector,
    toRegistry,
    withoutScreen,
  } from '../screen-registry';
  import type { IRegisteredScreen } from '../screen-registry';
  import type { IScreenProps, ISvelteScreenOptions } from '../screen-props';
  import StackScreen from './stack-screen.svelte';
  import type { IStackProps } from './stack-props';

  let { initialRouteName, screenOptions, children }: IStackProps = $props();

  // Read BEFORE this Stack sets its own scope, as it becomes the `parent` of its screens
  // Kept as the box, so every later read sees the current value
  const parentScope = getNavigationScope();

  const routeIdPrefix = `stack-${(stackInstanceCounter += 1)}`;

  // `$state.raw`, as an entry holds a component behind live getters that a deep proxy would wrap
  let screens = $state.raw<IRegisteredScreen<IScreenProps['options']>[]>([]);
  setScreenCollector<IScreenProps['options']>({
    kind: 'stack',
    register: screen => {
      screens = [...screens, screen];
    },
    unregister: screen => {
      screens = withoutScreen(screens, screen);
    },
  });

  const registry = $derived(toRegistry(screens));
  const createRoute = createRouteFactory(routeIdPrefix);
  const { emitterFor, broadcastState } = createEmitterStore();

  // `seededState` is a plain local: memoizing inside the derivation is no state write, and the
  // route key is allocated once however often the derivation re-runs
  let pushedState = $state.raw<INavigatorState | null>(null);
  let seededState: INavigatorState | undefined;

  // Not memoized while no route is known, as the markers may still be registering
  function seedState(): INavigatorState {
    if (seededState !== undefined) return seededState;
    const isPlaceholder = registry.size === 0 && initialRouteName === undefined;
    const seeded = buildInitialState(
      registry,
      initialRouteName,
      routeIdPrefix,
      createRoute,
    );
    if (!isPlaceholder) seededState = seeded;
    return seeded;
  }

  // A marker can unregister while its route is in the history. The repair is pure and keeps the
  // reference when nothing changed, and `dispatch` persists it by reducing over this value
  const state = $derived(
    reconcileStackRoutes(pushedState ?? seedState(), [...registry.keys()]),
  );

  function dispatch(action: INavigatorAction): void {
    pushedState = navigatorReducer(state, action);
  }

  const handle = createStackHandle(
    dispatch,
    createRoute,
    () => state.routes.length > 1,
  );

  export const {
    push,
    pop,
    popToTop,
    popTo,
    replace,
    setParams,
    reset,
    canGoBack,
  } = handle;

  function popOne(): void {
    dispatch({ type: 'pop', count: 1 });
  }

  // An effect, so the first broadcast lands after the initial screen has mounted and subscribed
  $effect(() => {
    broadcastState(state);
  });

  const stackProps = buildStackHostProps();

  function optionsFor(route: IRoute<unknown>): ISvelteScreenOptions {
    return mergeScreenOptions(
      registry.get(route.name)?.options,
      { route, navigation: handle },
      screenOptions,
    );
  }

  function componentFor(route: IRoute<unknown>): Component | undefined {
    const entry = registry.get(route.name);
    if (entry === undefined) {
      dlog(`Stack: no screen registered for route name "${route.name}"`);
      return undefined;
    }
    return entry.component;
  }
</script>

<view p={STACK_ROOT_PROPS}>
  <text p={SCREEN_REGISTRY_HOST_PROPS}>
    {@render children?.()}
  </text>
  <svelte:element
    this={RNS_SCREEN_STACK_VIEW_NAME}
    {@attach hostProps(stackProps)}
  >
    {#each state.routes as route, index (route.key)}
      {@const screenComponent = componentFor(route)}
      {#if screenComponent !== undefined}
        <StackScreen
          {route}
          {index}
          routeCount={state.routes.length}
          options={optionsFor(route)}
          navigation={handle}
          emitter={emitterFor(route.key)}
          parentScope={parentScope?.current}
          component={screenComponent}
          onPopRequested={popOne}
        />
      {/if}
    {/each}
  </svelte:element>
</view>
