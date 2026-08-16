<script lang="ts" module>
  // Stack, the Svelte lifecycle half. The route-stack transitions (navigator-state) and the
  // options/props folds (screen-options, render-stack) live in @symbiote-native/navigation core,
  // shared verbatim with the React/Vue/Angular entries; here Svelte supplies the lifecycle -
  // `$state.raw` for the pushed-route stack (its twin of useReducer: reassign from the same pure
  // reducer), a module counter for route-key generation, `export function`s for the push/pop/
  // replace navigator handle (Svelte's twin of Vue's expose(), reachable via `bind:this`) - plus
  // the react-native-screens chrome per route (stack-screen.svelte). Pushing/popping a route is
  // an ordinary child mount/unmount: RNSScreenStack diffs its RNSScreen children natively, so no
  // imperative native command is needed here at all. Neither this nor the Screen marker imports
  // react-native-screens' own React components (ScreenStack.tsx et al - hooks, crashes a
  // non-React adapter); the native views are driven directly through the ViewConfig ../../register
  // registers. See CLAUDE.md <third_party_rn_packages_are_react_only>.
  //
  // HOW SCREENS ARE DISCOVERED: not by reading `children`, which Svelte hands over as an opaque
  // Snippet - the markers register themselves through the context collector (../screen-registry.ts)
  // while the snippet renders, and the route list derives from that. The snippet is rendered
  // inside a collapsed `symbiote-text` (../registry-host.ts) so whitespace between two markers
  // can never become an illegal raw-text child of a native view.

  // Route keys must be unique per Stack INSTANCE (Svelte has no useId); a module counter is the
  // same mechanism the Angular entry uses.
  let stackInstanceCounter = 0;

  const STACK_ROOT_PROPS: Record<string, unknown> = { style: { flex: 1 } };
</script>

<script lang="ts">
  import type { Component } from 'svelte';
  import { dlog } from '@symbiote-native/engine';
  import { toTemplateSafeProps } from '@symbiote-native/svelte/renderer';
  import {
    NAVIGATION_EVENT_STATE,
    RNS_SCREEN_STACK_VIEW_NAME,
    STACK_ON_FINISH_TRANSITIONING,
    createInitialNavigatorState,
    createNavigationEmitter,
    navigatorReducer,
    reconcileStackRoutes,
    resolveStackProps,
  } from '../../core';
  import type {
    INavigationEmitter,
    INavigatorAction,
    INavigatorHandle,
    INavigatorState,
    IRoute,
  } from '../../core';
  import { hostProps } from '../attachments';
  import { getNavigationScope } from '../navigation-context';
  import { SCREEN_REGISTRY_HOST_PROPS } from '../registry-host';
  import { setScreenCollector, toRegistry, withoutScreen } from '../screen-registry';
  import type { IRegisteredScreen } from '../screen-registry';
  import type { IScreenProps, ISvelteScreenOptions } from '../screen-props';
  import StackScreen from './stack-screen.svelte';
  import type { IStackProps } from './stack-props';

  // `style` collides with Svelte's own special-cased attribute name (svelte-adapter-custom-
  // renderer skill §6 / renderer.ts's TEMPLATE_KEY_UNMANGLE) — both of these root-level bags carry
  // a literal `style` key and are spread straight onto a `symbiote-*` intrinsic below, so they are
  // renamed once, up front; `setAttributeOp`'s `realPropName()` reverses it right before
  // `routeProp`.
  const STACK_ROOT_TEMPLATE_PROPS = toTemplateSafeProps(STACK_ROOT_PROPS);
  const SCREEN_REGISTRY_TEMPLATE_PROPS = toTemplateSafeProps(SCREEN_REGISTRY_HOST_PROPS);

  let { initialRouteName, screenOptions, children }: IStackProps = $props();

  // Read BEFORE this Stack establishes its own per-screen NavigationScope - becomes the `parent`
  // link a nested screen's useNavigation().getParent() walks (e.g. this Stack rendered as a Tab
  // screen's content reaches that Tab via this value). undefined when this Stack is the nesting
  // root. Kept as the BOX, not its unwrapped value, so every read below sees the current one.
  const parentScope = getNavigationScope();

  const routeIdPrefix = `stack-${(stackInstanceCounter += 1)}`;

  // `$state.raw` + reassignment, never a mutated array: an entry holds a component reference (a
  // plain function) behind live getters, and a deep reactive proxy would wrap both.
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

  let routeSequence = 0;
  function createRoute(name: string, params: unknown): IRoute<unknown> {
    routeSequence += 1;
    return { key: `${routeIdPrefix}-${name}-${routeSequence}`, name, params };
  }

  // The pushed stack only exists once something has dispatched; until then the state derives from
  // whatever the markers registered. `seededState` is a PLAIN local (not `$state`), so memoizing
  // it inside the derivation below is not a state write during a derivation - it just makes the
  // one route-key-allocating call happen exactly once, no matter how often the derivation re-runs
  // as markers register.
  let pushedState = $state.raw<INavigatorState | null>(null);
  let seededState: INavigatorState | undefined;

  function seedState(): INavigatorState {
    if (seededState !== undefined) return seededState;
    const startRouteName = initialRouteName ?? registry.keys().next().value;
    if (startRouteName === undefined) {
      dlog('Stack: no <Stack.Screen> children registered');
      // Deliberately NOT memoized: markers may still be registering, and the next derivation run
      // should get a real initial route rather than being stuck on this placeholder.
      return createInitialNavigatorState({ key: routeIdPrefix, name: '', params: undefined });
    }
    seededState = createInitialNavigatorState(
      createRoute(startRouteName, registry.get(startRouteName)?.initialParams),
    );
    return seededState;
  }

  // A `<Stack.Screen>` marker can unregister while its route is still in the pushed history (a
  // marker behind an `{#if}`, a data-driven screen list), which would leave that entry with nothing
  // for componentFor() to mount (reconcileStackRoutes' header). The reconciliation belongs in the
  // derivation because it is PURE - it hands back the same state reference when nothing changed, so
  // it writes no state and cannot re-trigger itself; `dispatch` below then persists the pruned
  // history, since it reduces over this value rather than over `pushedState`.
  const state = $derived(reconcileStackRoutes(pushedState ?? seedState(), [...registry.keys()]));

  function dispatch(action: INavigatorAction): void {
    pushedState = navigatorReducer(state, action);
  }

  // One emitter per route.key, created lazily the first time a route is rendered and pruned once
  // it is popped off the stack (the broadcast effect below).
  const emitters = new Map<string, INavigationEmitter>();
  function emitterFor(routeKey: string): INavigationEmitter {
    let emitter = emitters.get(routeKey);
    if (emitter === undefined) {
      emitter = createNavigationEmitter();
      emitters.set(routeKey, emitter);
    }
    return emitter;
  }

  export function push(name: string, params?: unknown): void {
    dispatch({ type: 'push', route: createRoute(name, params) });
  }
  export function pop(count?: number): void {
    dispatch({ type: 'pop', count });
  }
  export function popToTop(): void {
    dispatch({ type: 'popToTop' });
  }
  export function popTo(key: string): void {
    dispatch({ type: 'popTo', key });
  }
  export function replace(name: string, params?: unknown): void {
    dispatch({ type: 'replace', route: createRoute(name, params) });
  }
  export function setParams(params: unknown, key?: string): void {
    dispatch({ type: 'setParams', key, params });
  }
  export function reset(nextState: INavigatorState): void {
    dispatch({ type: 'reset', state: nextState });
  }
  export function canGoBack(): boolean {
    return state.routes.length > 1;
  }

  // The same handle, as a value, for everything that needs it INSIDE this component (the options
  // fold's `navigation` argument, every route's NavigationScope). `bind:this` exposes the
  // `export function`s above; this object is the internal twin of that surface.
  const handle: INavigatorHandle = {
    push,
    pop,
    popToTop,
    popTo,
    replace,
    setParams,
    reset,
    canGoBack,
  };

  function popOne(): void {
    dispatch({ type: 'pop', count: 1 });
  }

  // Broadcasts the router state to every still-live route's emitter (useNavigationState's source)
  // after each commit, and prunes emitters for routes popped off the stack. Runs as an $effect
  // rather than inline in the render path (Vue's shape), so the first broadcast lands AFTER the
  // initial route's own screen has mounted and subscribed.
  $effect(() => {
    const current = state;
    for (const route of current.routes) {
      emitterFor(route.key).emit(NAVIGATION_EVENT_STATE, current);
    }
    for (const routeKey of [...emitters.keys()]) {
      if (!current.routes.some(route => route.key === routeKey)) emitters.delete(routeKey);
    }
  });

  // Investigation instrumentation (flicker-on-focus bug): STACK_ON_FINISH_TRANSITIONING is the
  // native signal that the WHOLE push/pop animation has finished (as opposed to onAppear/
  // onDisappear, which are per-screen) - logging it lets the per-screen appear/disappear
  // timestamps be checked against the actual transition-complete moment. Kept behind DEBUG,
  // never removed.
  const stackProps = resolveStackProps({
    passthrough: {
      [STACK_ON_FINISH_TRANSITIONING]: () => dlog(`Stack: onFinishTransitioning at t=${Date.now()}`),
    },
  });

  function optionsFor(route: IRoute<unknown>): ISvelteScreenOptions {
    const entry = registry.get(route.name);
    const own =
      entry === undefined
        ? undefined
        : typeof entry.options === 'function'
          ? entry.options({ route, navigation: handle })
          : entry.options;
    return { ...screenOptions, ...own };
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

<symbiote-view {...STACK_ROOT_TEMPLATE_PROPS}><symbiote-text {...SCREEN_REGISTRY_TEMPLATE_PROPS}>{@render children?.()}</symbiote-text><svelte:element this={RNS_SCREEN_STACK_VIEW_NAME} {@attach hostProps(stackProps)}>{#each state.routes as route, index (route.key)}{@const screenComponent = componentFor(route)}{#if screenComponent !== undefined}<StackScreen {route} {index} routeCount={state.routes.length} options={optionsFor(route)} navigation={handle} emitter={emitterFor(route.key)} parentScope={parentScope?.current} component={screenComponent} onPopRequested={popOne} />{/if}{/each}</svelte:element></symbiote-view>
