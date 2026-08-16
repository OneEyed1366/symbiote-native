<script lang="ts" module>
  // Drawer, the Svelte lifecycle half. The open/closed + focused-route router
  // (drawer-router-state) and the pure swipe/geometry math (drawer-options) live in
  // @symbiote-native/navigation core, shared verbatim with the React/Vue/Angular entries; here
  // Svelte supplies the lifecycle - `$state.raw` for the router (its twin of useReducer), a
  // PanResponder for the swipe gesture (built ONCE, its callbacks reading options and open-state
  // LIVE off `$props()`/`$state` at gesture time), an AnimatedValue driving the slide/opacity
  // transforms, and `export function`s for the open/close/toggle/jumpTo handle - mirroring
  // tabs/index.svelte's shape (Tab is the closer sibling: both are fixed-route-list,
  // no-react-native-screens navigators; Stack's push/pop + native-screen bridging don't apply).
  //
  // FEASIBILITY NOTE (mirrored from the React/Vue twins): the REAL @react-navigation/drawer is
  // built on react-native-gesture-handler + react-native-reanimated, neither of which this
  // codebase depends on. What's built here reaches the same swipe-to-open/close +
  // front/back/slide/permanent behavior using only PanResponder + Animated (both already in
  // @symbiote-native/engine), which is sufficient for a solid drawer but NOT byte-for-byte parity
  // - see the explicit gap list at the bottom of this file (verbatim from the React twin - the
  // gaps are architectural, not adapter-specific).
  let drawerInstanceCounter = 0;

  const DRAWER_SNAP_DURATION = 250;
</script>

<script lang="ts">
  import type { Component } from 'svelte';
  import { onDestroy, tick } from 'svelte';
  import { AnimatedValue, Dimensions, PanResponder, dlog, timing } from '@symbiote-native/engine';
  import type { IPanResponderGestureState, ISymbioteEvent } from '@symbiote-native/engine';
  import { toTemplateSafeProps } from '@symbiote-native/svelte/renderer';
  // The ONLY import from the adapter's main barrel: `Animated.View` is a compiled `.svelte`
  // component, so unlike PanResponder/Dimensions/AnimatedValue (pure engine re-exports, taken
  // from the engine directly here) it has no `.svelte`-free home to import from.
  import { Animated } from '@symbiote-native/svelte';
  import {
    DRAWER_DEFAULT_OVERLAY_COLOR,
    NAVIGATION_EVENT_BLUR,
    NAVIGATION_EVENT_FOCUS,
    createInitialDrawerRouterState,
    createNavigationEmitter,
    diffFocusedRoute,
    drawerChildOrder,
    drawerRouterReducer,
    isDrawerAnimated,
    renderDrawer,
    resolveDragProgress,
    resolveDrawerGeometry,
    resolveDrawerSlotInterpolation,
    resolveSwipeIntent,
    shouldClaimDrawerSwipe,
  } from '../../core';
  import type {
    IDescriptor,
    IDrawerDescriptorMap,
    IDrawerNavigatorHandle,
    IDrawerOptions,
    IDrawerRouterAction,
    IDrawerRouterState,
    IDrawerScreenOptions,
    IDrawerSlot,
    INavigationEmitter,
    IRoute,
  } from '../../core';
  import { getNavigationScope } from '../navigation-context';
  import type { INavigationScopeValue } from '../navigation-context';
  import NavigationScope from '../navigation-scope.svelte';
  import { SCREEN_REGISTRY_HOST_PROPS } from '../registry-host';
  import { setScreenCollector, toRegistry, withoutScreen } from '../screen-registry';
  import type { IRegisteredScreen } from '../screen-registry';
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

  // `style` collides with Svelte's own special-cased attribute name (svelte-adapter-custom-
  // renderer skill §6 / renderer.ts's TEMPLATE_KEY_UNMANGLE) — this bag carries a literal `style`
  // key and is spread straight onto a `symbiote-*` intrinsic below, so it is renamed once, up
  // front; `setAttributeOp`'s `realPropName()` reverses it right before `routeProp`.
  const SCREEN_REGISTRY_TEMPLATE_PROPS = toTemplateSafeProps(SCREEN_REGISTRY_HOST_PROPS);

  // Read BEFORE this Drawer establishes its own per-screen NavigationScope - becomes the `parent`
  // link a nested screen's useNavigation().getParent() walks. undefined at the nesting root.
  const parentScope = getNavigationScope();

  const routeIdPrefix = `drawer-${(drawerInstanceCounter += 1)}`;

  // Unlike Vue (which reads everything off untyped `attrs` and needs a per-field guard to get
  // back into the typed core surface), Svelte's `$props()` is already typed by IDrawerProps, so
  // this is a plain re-assembly with no narrowing at all.
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

  let screens = $state.raw<IRegisteredScreen<IDrawerScreenProps['options']>[]>([]);
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

  // Same seed-once-then-dispatch shape Stack and Tab use.
  let dispatchedState = $state.raw<IDrawerRouterState | null>(null);
  let seededState: IDrawerRouterState | undefined;
  let routeSequence = 0;

  function seedState(): IDrawerRouterState {
    if (seededState !== undefined) return seededState;
    const routes: IRoute<unknown>[] = [...registry.entries()].map(([name, entry]) => {
      routeSequence += 1;
      return { key: `${routeIdPrefix}-${name}-${routeSequence}`, name, params: entry.initialParams };
    });
    if (routes.length === 0) {
      dlog('Drawer: no <Drawer.Screen> children registered');
      // Deliberately not memoized - markers may still be registering.
      return createInitialDrawerRouterState(routes, initialRouteName);
    }
    seededState = createInitialDrawerRouterState(routes, initialRouteName);
    return seededState;
  }

  const state = $derived(dispatchedState ?? seedState());

  function dispatch(action: IDrawerRouterAction): void {
    dispatchedState = drawerRouterReducer(state, action);
  }

  // progress: 0 closed -> 1 open, the single AnimatedValue every slide/opacity transform below
  // interpolates from. A plain `const`: a Svelte component's script runs once, so this needs no
  // re-creation guard the way React's useRef(new Animated.Value(...)).current does.
  const progress = new AnimatedValue(state.isOpen ? 1 : 0);
  // Where a drag STARTS from, in progress units. Always exactly 0 or 1: a gesture only ever
  // begins at rest, since terminate/release always snap the value back to a resting state before
  // another grant can fire.
  let dragStartProgress = 0;

  function animateProgressTo(open: boolean): void {
    dlog(`Drawer: animateProgressTo(open=${open}) starting at t=${Date.now()}`);
    timing(progress, {
      toValue: open ? 1 : 0,
      duration: DRAWER_SNAP_DURATION,
      // Native-driver wiring is deferred for v1 - see this file's header feasibility note. The
      // JS timing loop still drives every frame, same as any other non-native-driven timing in
      // this codebase.
      useNativeDriver: false,
    }).start();
  }

  export function openDrawer(): void {
    dlog(`Drawer: openDrawer() called, isOpen=${state.isOpen} at t=${Date.now()}`);
    animateProgressTo(true);
    dispatch({ type: 'openDrawer' });
  }
  export function closeDrawer(): void {
    dlog(`Drawer: closeDrawer() called, isOpen=${state.isOpen} at t=${Date.now()}`);
    animateProgressTo(false);
    dispatch({ type: 'closeDrawer' });
  }
  export function toggleDrawer(): void {
    dlog(`Drawer: toggleDrawer() called, isOpen=${state.isOpen} at t=${Date.now()}`);
    animateProgressTo(!state.isOpen);
    dispatch({ type: 'toggleDrawer' });
  }
  export function jumpTo(name: string): void {
    // Captured BEFORE dispatch: `state` is recomputed synchronously from the reassigned
    // `dispatchedState`, so reading it after would already see the reducer's own isOpen: false.
    const wasOpen = state.isOpen;
    dispatch({ type: 'jumpTo', name });
    if (wasOpen) animateProgressTo(false);
  }

  const handle: IDrawerNavigatorHandle = { openDrawer, closeDrawer, toggleDrawer, jumpTo };

  // The window width is read fresh AT GESTURE TIME rather than through a reactive
  // window-dimensions rune: it is only ever consumed inside these PanResponder callbacks (never
  // rendered), so a live `Dimensions.get` is both simpler and strictly more current than a
  // subscription that has to round-trip a re-render first.
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (
      event: ISymbioteEvent,
      gestureState: IPanResponderGestureState,
    ): boolean =>
      shouldClaimDrawerSwipe(
        event,
        gestureState,
        Dimensions.get('window').width,
        state.isOpen,
        options,
        'start',
      ),
    onMoveShouldSetPanResponder: (
      event: ISymbioteEvent,
      gestureState: IPanResponderGestureState,
    ): boolean =>
      shouldClaimDrawerSwipe(
        event,
        gestureState,
        Dimensions.get('window').width,
        state.isOpen,
        options,
        'move',
      ),
    onPanResponderGrant: (): void => {
      dlog('Drawer: gesture grant');
      dragStartProgress = state.isOpen ? 1 : 0;
    },
    onPanResponderMove: (_event: ISymbioteEvent, gestureState: IPanResponderGestureState): void => {
      progress.setValue(resolveDragProgress(gestureState, dragStartProgress, options));
    },
    onPanResponderRelease: (
      _event: ISymbioteEvent,
      gestureState: IPanResponderGestureState,
    ): void => {
      const intent = resolveSwipeIntent(gestureState, state.isOpen, options);
      const open = intent === 'open';
      dlog(`Drawer: gesture release -> ${open ? 'open' : 'close'}`);
      animateProgressTo(open);
      dispatch(open ? { type: 'openDrawer' } : { type: 'closeDrawer' });
    },
    onPanResponderTerminate: (): void => {
      dlog('Drawer: gesture terminated, snapping back');
      animateProgressTo(state.isOpen);
    },
  });

  // Only the focused route's screen is ever mounted (like Tab, unlike Stack which keeps every
  // pushed route alive). One emitter per route.key, created lazily and cached for the navigator's
  // whole lifetime.
  const emitters = new Map<string, INavigationEmitter>();
  function emitterFor(routeKey: string): INavigationEmitter {
    let emitter = emitters.get(routeKey);
    if (emitter === undefined) {
      emitter = createNavigationEmitter();
      emitters.set(routeKey, emitter);
    }
    return emitter;
  }

  // Focus/blur synthesis, deferred to `tick()` for the same reason tabs/index.svelte documents:
  // the newly-focused screen's own subscriptions are created during THIS flush, after this
  // effect was.
  let previousFocusedKey: string | undefined;
  $effect(() => {
    const nextKey = state.routes[state.index]?.key;
    const { blurKey, focusKey } = diffFocusedRoute(previousFocusedKey, nextKey);
    if (blurKey === undefined && focusKey === undefined) return;
    previousFocusedKey = nextKey;
    void tick().then(() => {
      if (blurKey !== undefined) {
        dlog(`Drawer: route "${blurKey}" blurred at t=${Date.now()}`);
        emitterFor(blurKey).emit(NAVIGATION_EVENT_BLUR);
      }
      if (focusKey !== undefined) {
        dlog(`Drawer: route "${focusKey}" focused at t=${Date.now()}`);
        emitterFor(focusKey).emit(NAVIGATION_EVENT_FOCUS);
      }
    });
  });

  onDestroy(() => {
    if (previousFocusedKey !== undefined) {
      emitterFor(previousFocusedKey).emit(NAVIGATION_EVENT_BLUR);
    }
  });

  const animated = $derived(isDrawerAnimated(options));
  const geometry = $derived(resolveDrawerGeometry(options));

  const panelTranslateX = $derived(
    animated
      ? progress.interpolate(resolveDrawerSlotInterpolation(geometry, 'panel').translateX)
      : undefined,
  );
  const contentTranslateX = $derived(
    animated
      ? progress.interpolate(resolveDrawerSlotInterpolation(geometry, 'content').translateX)
      : undefined,
  );
  // The overlay is a full-screen absolutely-positioned sibling BELOW content in paint order (see
  // render-drawer.ts's drawerChildOrder) - for 'front' that's fine since content never moves, but
  // for 'slide' content itself translates away by contentTranslateX, and without following it the
  // overlay stays pinned full-screen. resolveDrawerSlotInterpolation's 'overlay' branch ties its
  // translateX to the SAME range as content's for exactly this reason, so overlayOpacity and
  // overlayTranslateX below share one resolved config.
  const overlayInterpolation = $derived(
    animated ? resolveDrawerSlotInterpolation(geometry, 'overlay') : undefined,
  );
  const overlayStyle = $derived(
    overlayInterpolation === undefined
      ? undefined
      : {
          opacity: progress.interpolate(overlayInterpolation.opacity),
          transform: [{ translateX: progress.interpolate(overlayInterpolation.translateX) }],
        },
  );
  const contentStyle = $derived(
    contentTranslateX === undefined ? undefined : { transform: [{ translateX: contentTranslateX }] },
  );
  const panelStyle = $derived(
    panelTranslateX === undefined ? undefined : { transform: [{ translateX: panelTranslateX }] },
  );

  const focusedRoute = $derived(state.routes[state.index]);
  const focusedScreen = $derived.by<
    { scope: INavigationScopeValue; component: Component } | undefined
  >(() => {
    if (focusedRoute === undefined) return undefined;
    const entry = registry.get(focusedRoute.name);
    if (entry === undefined) {
      dlog(`Drawer: no screen registered for route name "${focusedRoute.name}"`);
      return undefined;
    }
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

  function resolveDrawerScreenOptions(
    entry: IRegisteredScreen<IDrawerScreenProps['options']>,
    route: IRoute<unknown>,
  ): IDrawerScreenOptions {
    if (typeof entry.options === 'function') return entry.options({ route, navigation: handle });
    return entry.options ?? {};
  }

  const descriptors = $derived.by<IDrawerDescriptorMap>(() => {
    const map: IDrawerDescriptorMap = {};
    for (const route of state.routes) {
      const entry = registry.get(route.name);
      if (entry === undefined) continue;
      map[route.key] = { options: resolveDrawerScreenOptions(entry, route), navigation: handle };
    }
    return map;
  });

  const root = $derived.by<IDescriptor>(() =>
    renderDrawer(
      {
        overlayColor: overlayColor ?? DRAWER_DEFAULT_OVERLAY_COLOR,
        drawerStyle,
        contentPassthrough: {},
        overlayPassthrough: animated
          ? {
              pointerEvents: state.isOpen ? 'auto' : 'none',
              onStartShouldSetResponder: () => true,
              onResponderRelease: () => {
                animateProgressTo(false);
                dispatch({ type: 'closeDrawer' });
              },
            }
          : {},
        panelPassthrough: {},
      },
      options,
    ),
  );

  const order = $derived(drawerChildOrder(options));

  // renderDrawer emits its slots as root children IN `drawerChildOrder`'s order, so the two zip
  // together - the same index-pairing Vue's own render loop does.
  const slotDescriptors = $derived.by<Partial<Record<IDrawerSlot, IDescriptor>>>(() => {
    const map: Partial<Record<IDrawerSlot, IDescriptor>> = {};
    order.forEach((slot, index) => {
      const descriptor = root.children[index];
      if (typeof descriptor !== 'string' && descriptor !== undefined) map[slot] = descriptor;
    });
    return map;
  });

  // `style` collides with Svelte's own special-cased attribute name (svelte-adapter-custom-
  // renderer skill §6 / renderer.ts's TEMPLATE_KEY_UNMANGLE) — renamed before the spread;
  // `setAttributeOp`'s `realPropName()` reverses it right before `routeProp`.
  const rootProps = $derived(
    toTemplateSafeProps({
      style: root.props.style,
      ...panResponder.panHandlers,
    }),
  );
</script>

{#snippet screenContent()}{#if focusedScreen !== undefined}{@const FocusedComponent = focusedScreen.component}<NavigationScope value={focusedScreen.scope}><FocusedComponent /></NavigationScope>{/if}{/snippet}{#snippet contentSlot()}{@const descriptor = slotDescriptors.content}{#if descriptor !== undefined}{#if contentStyle !== undefined}<Animated.View {...descriptor.props} style={[descriptor.props.style, contentStyle]}>{@render screenContent()}</Animated.View>{:else}<symbiote-view {...toTemplateSafeProps(descriptor.props)}>{@render screenContent()}</symbiote-view>{/if}{/if}{/snippet}{#snippet overlaySlot()}{@const descriptor = slotDescriptors.overlay}{#if descriptor !== undefined}{#if overlayStyle !== undefined}<Animated.View {...descriptor.props} style={[descriptor.props.style, overlayStyle]} />{:else}<symbiote-view {...toTemplateSafeProps(descriptor.props)} />{/if}{/if}{/snippet}{#snippet panelSlot()}{@const descriptor = slotDescriptors.panel}{#if descriptor !== undefined}{#if panelStyle !== undefined}<Animated.View {...descriptor.props} style={[descriptor.props.style, panelStyle]}>{@render drawerContent?.({ state, descriptors, navigation: handle })}</Animated.View>{:else}<symbiote-view {...toTemplateSafeProps(descriptor.props)}>{@render drawerContent?.({ state, descriptors, navigation: handle })}</symbiote-view>{/if}{/if}{/snippet}<symbiote-view {...rootProps}><symbiote-text {...SCREEN_REGISTRY_TEMPLATE_PROPS}>{@render children?.()}</symbiote-text>{#each order as slot (slot)}{#if slot === 'content'}{@render contentSlot()}{:else if slot === 'overlay'}{@render overlaySlot()}{:else}{@render panelSlot()}{/if}{/each}</symbiote-view>

<!-- --- Explicit gap list vs the real react-native-gesture-handler + react-native-reanimated
     @react-navigation/drawer (confirmed against its current docs, mirrored verbatim from the
     React twin - the gaps are architectural, not adapter-specific) ---
     1. `configureGestureHandler` - a raw react-native-gesture-handler `Gesture` object escape
        hatch. No PanResponder equivalent exists; not ported.
     2. Simultaneous/failure gesture RELATIONSHIPS (gesture-handler's declarative composition vs
        a nested ScrollView, another PanResponder, etc.) - PanResponder only offers negotiation
        via the should-set boolean gates used here (edge-start + dominant-axis), which is more
        prone to an accidental hijack of a nested horizontal ScrollView/Swiper than
        gesture-handler's system.
     3. `useDrawerProgress` - a Reanimated SharedValue read on the UI thread. `progress` here is a
        JS-thread AnimatedValue; interpolating it for consumer-facing content animation works, but
        without native-driver wiring (gap noted above) it does not carry the same synchronous
        UI-thread guarantee under JS-thread load.
     4. `hideStatusBarOnOpen` / `keyboardDismissMode` / `statusBarAnimation` / `overlayStyle` -
        not wired in this pass; straightforward additions once StatusBar/Keyboard module wiring is
        needed here (not a PanResponder/Animated limitation, just unscoped for v1). -->
