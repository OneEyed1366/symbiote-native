// Drawer, the Solid lifecycle half. The open/closed + focused-route router (drawer-router-state)
// and the pure swipe/geometry math (drawer-options) live in @symbiote-native/navigation core,
// shared verbatim with every other adapter; here Solid supplies the lifecycle - a signal for the
// router, a PanResponder built ONCE whose callbacks read options/window-width/isOpen LIVE (Solid
// props are getters, so a gesture callback always sees the current value with no ref-mirroring
// dance), an Animated.Value driving the slide/opacity transforms, and a callback `ref` for the
// open/close/toggle/jumpTo handle. Tab is the closer sibling (both are fixed-route-list,
// no-react-native-screens navigators); Stack's push/pop and native-screen bridging don't apply.
//
// FEASIBILITY NOTE (mirrored verbatim from the React/Vue twins - the gaps are architectural, not
// adapter-specific): the REAL @react-navigation/drawer is built on react-native-gesture-handler +
// react-native-reanimated, neither of which this codebase depends on. What's built here reaches the
// same swipe-to-open/close + front/back/slide/permanent behavior using only PanResponder +
// Animated (both already in @symbiote-native/engine). See the explicit gap list at the bottom.
//
// THE SOLID-ONLY PART: renderDrawer's Descriptor SHAPE follows `drawerType` - the slot ORDER
// changes, and 'permanent' drops the animation entirely. descriptorToSolid builds once and updates
// props in place, so a type/position change is a genuine rebuild boundary and is asked for by name
// (a createMemo over those discriminators alone, build untracked -
// .claude/rules/solid-descriptor-bridge.md §5). Everything else - width, overlay colour, the live
// interpolations, the focused screen's params - flows through prop accessors on the existing nodes.
//
// `drawerContent` is a render prop taking an ACCESSOR, called once and untracked, not a plain
// value: §4 of the same rules file. A value snapshot would freeze the drawer's own content at the
// state it was built with, and re-invoking it from inside a tracked scope would replace the whole
// panel subtree mid-gesture.

import {
  createEffect,
  createMemo,
  createSignal,
  mergeProps,
  onCleanup,
  untrack,
} from 'solid-js';
import type { Accessor } from 'solid-js';
import { Animated, createWindowDimensions } from '@symbiote-native/solid';
import type { IAnimatedComponentProps } from '@symbiote-native/solid';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
// createComponent from solid-js, insert from the renderer - see stack/index.ts's note.
import { createComponent } from 'solid-js';
import { insert } from '@symbiote-native/solid/renderer';
import { PanResponder, dlog } from '@symbiote-native/engine';
import type {
  IPanResponderGestureState,
  IStyleProp,
  ISymbioteEvent,
  ISymbioteNode,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IDescriptor } from '@symbiote-native/components';
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
  resolveDrawerPosition,
  resolveDrawerSlotInterpolation,
  resolveDrawerType,
  resolveSwipeIntent,
  shouldClaimDrawerSwipe,
} from '../../core';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
  IDrawerOptions,
  IDrawerRouterState,
  IDrawerScreenOptions,
  IDrawerSlot,
  INavigationEmitter,
  IRoute,
} from '../../core';
import { hostElement } from '../host';
import {
  NavigationScopeProvider,
  useNavigationScope,
} from '../navigation-context';
import type { INavigationScope } from '../navigation-context';
import {
  ScreenCollectorProvider,
  createScreenSignal,
  toRegistry,
} from '../screen-registry';
import type { IRegisteredScreen } from '../screen-registry';
import { DrawerScreen } from '../screen';
import type {
  IDrawerScreenOptionsArgs,
  IDrawerScreenProps,
} from '../drawer-screen-props';

export type { IDrawerNavigatorHandle, IDrawerDescriptorMap } from '../../core';

// React's `renderDrawerContent` render-PROP and Vue's `drawerContent` scoped slot become a render
// prop over an ACCESSOR here - the shape Solid core itself uses for `<For>{(item) => …}`.
export type IDrawerContentSlotProps = {
  state: IDrawerRouterState;
  descriptors: IDrawerDescriptorMap;
  navigation: IDrawerNavigatorHandle;
};

export type IDrawerProps = IDrawerOptions & {
  initialRouteName?: string;
  drawerStyle?: IStyleProp<IViewStyle>;
  drawerContent?: (props: Accessor<IDrawerContentSlotProps>) => JSX.Element;
  ref?: (handle: IDrawerNavigatorHandle) => void;
  children?: JSX.Element;
};

const DRAWER_SNAP_DURATION = 250;

let navigatorSequence = 0;

type IDrawerScreenEntry = IRegisteredScreen<IDrawerScreenProps['options']>;

function resolveDrawerScreenOptions(
  entry: IDrawerScreenEntry,
  args: IDrawerScreenOptionsArgs,
): IDrawerScreenOptions {
  if (typeof entry.options === 'function') return entry.options(args);
  return entry.options ?? {};
}

// What makes renderDrawer's Descriptor a DIFFERENT tree rather than the same tree with new props.
type IDrawerShape = { type: string; position: string; animated: boolean };

function sameDrawerShape(a: IDrawerShape, b: IDrawerShape): boolean {
  return (
    a.type === b.type && a.position === b.position && a.animated === b.animated
  );
}

function DrawerImpl(props: IDrawerProps): JSX.Element {
  const parentScope = useNavigationScope();

  const { screens, collector } = createScreenSignal<
    'drawer',
    IDrawerScreenProps['options']
  >('drawer');
  const registry = createMemo(() => toRegistry(screens()));

  navigatorSequence += 1;
  const routeIdPrefix = `drawer-${navigatorSequence}`;

  // Every field read live off `props`, so a gesture callback (built once, below) always negotiates
  // against the CURRENT options - Solid props are getters, which is what removes React's
  // useRef(value) mirroring here.
  function currentOptions(): IDrawerOptions {
    return {
      drawerType: props.drawerType,
      drawerPosition: props.drawerPosition,
      drawerWidth: props.drawerWidth,
      overlayColor: props.overlayColor,
      swipeEnabled: props.swipeEnabled,
      swipeEdgeWidth: props.swipeEdgeWidth,
      swipeMinDistance: props.swipeMinDistance,
      swipeMinVelocity: props.swipeMinVelocity,
    };
  }

  // Route keys are derived from the screen NAME, so the derivation is pure and re-runnable.
  const routes = createMemo<readonly IRoute<unknown>[]>(() =>
    [...registry().entries()].map(([name, entry]) => ({
      key: `${routeIdPrefix}-${name}`,
      name,
      params: entry.initialParams,
    })),
  );

  // `null` means nothing has dispatched yet - and until then the initial state is RE-DERIVED from
  // the registry on every read rather than cached. That is not an optimisation detail, it is what
  // makes the drawer correct: each marker registers with its OWN signal write, and Solid can
  // recompute a downstream memo between two of them, so a one-shot seed reliably captured only the
  // FIRST screen and every later jumpTo was a no-op against a one-route router. Once the app
  // dispatches, the route list freezes - matching React's and Vue's, which build it once in their
  // setup pass and never reconcile (a marker added after that is ignored on every adapter).
  const [dispatched, setDispatched] = createSignal<IDrawerRouterState | null>(
    null,
  );

  const state = createMemo<IDrawerRouterState>(() => {
    const current = dispatched();
    if (current !== null) return current;
    const initial = routes();
    if (initial.length === 0) {
      dlog('Drawer: no <Drawer.Screen> children registered');
    }
    return createInitialDrawerRouterState(initial, props.initialRouteName);
  });

  function dispatch(action: Parameters<typeof drawerRouterReducer>[1]): void {
    setDispatched(drawerRouterReducer(state(), action));
  }

  const windowDimensions = createWindowDimensions();

  // progress: 0 closed -> 1 open, the single Animated.Value every slide/opacity transform below
  // interpolates from. A plain const: a Solid body runs once, so this needs no re-creation guard
  // the way React's useRef(new Animated.Value(...)).current does.
  const progress = new Animated.Value(state().isOpen ? 1 : 0);
  // Where a drag STARTS from, in progress units. Always exactly 0 or 1: a gesture only begins at
  // rest, since terminate/release always snap back before another grant can fire.
  let dragStartProgress = 0;

  function animateProgressTo(open: boolean): void {
    dlog(`Drawer: animateProgressTo(open=${open}) at t=${Date.now()}`);
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: DRAWER_SNAP_DURATION,
      // Native-driver wiring is deferred for v1 - see the header feasibility note.
      useNativeDriver: false,
    }).start();
  }

  const handle: IDrawerNavigatorHandle = {
    openDrawer: () => {
      animateProgressTo(true);
      dispatch({ type: 'openDrawer' });
    },
    closeDrawer: () => {
      animateProgressTo(false);
      dispatch({ type: 'closeDrawer' });
    },
    toggleDrawer: () => {
      animateProgressTo(!state().isOpen);
      dispatch({ type: 'toggleDrawer' });
    },
    jumpTo: (name: string) => {
      // Both sides of the dispatch, because an unregistered name is a documented reducer no-op that
      // hands the SAME state back: animating off the pre-dispatch snapshot alone would slide the
      // panel shut while the router still says isOpen. The signal is written synchronously inside
      // dispatch, so the second read is already the reducer's own answer.
      const wasOpen = state().isOpen;
      dispatch({ type: 'jumpTo', name });
      if (wasOpen && !state().isOpen) animateProgressTo(false);
    },
  };
  props.ref?.(handle);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (
      event: ISymbioteEvent,
      gestureState: IPanResponderGestureState,
    ): boolean =>
      shouldClaimDrawerSwipe(
        event,
        gestureState,
        windowDimensions().width,
        state().isOpen,
        currentOptions(),
        'start',
      ),
    onMoveShouldSetPanResponder: (
      event: ISymbioteEvent,
      gestureState: IPanResponderGestureState,
    ): boolean =>
      shouldClaimDrawerSwipe(
        event,
        gestureState,
        windowDimensions().width,
        state().isOpen,
        currentOptions(),
        'move',
      ),
    onPanResponderGrant: (): void => {
      dragStartProgress = state().isOpen ? 1 : 0;
    },
    onPanResponderMove: (
      _event: ISymbioteEvent,
      gestureState: IPanResponderGestureState,
    ): void => {
      progress.setValue(
        resolveDragProgress(gestureState, dragStartProgress, currentOptions()),
      );
    },
    onPanResponderRelease: (
      _event: ISymbioteEvent,
      gestureState: IPanResponderGestureState,
    ): void => {
      const intent = resolveSwipeIntent(
        gestureState,
        state().isOpen,
        currentOptions(),
      );
      const open = intent === 'open';
      dlog(`Drawer: gesture release -> ${open ? 'open' : 'close'}`);
      animateProgressTo(open);
      dispatch(open ? { type: 'openDrawer' } : { type: 'closeDrawer' });
    },
    onPanResponderTerminate: (): void => {
      animateProgressTo(state().isOpen);
    },
  });

  const emitters = new Map<string, INavigationEmitter>();
  function emitterFor(routeKey: string): INavigationEmitter {
    let emitter = emitters.get(routeKey);
    if (emitter === undefined) {
      emitter = createNavigationEmitter();
      emitters.set(routeKey, emitter);
    }
    return emitter;
  }

  const focusedKey = createMemo(() => {
    const current = state();
    return current.routes[current.index]?.key;
  });

  // Deferred by a microtask for the same reason Tab's is: the newly focused screen's subtree, and
  // the subscriptions inside it, are built by the effect flush this callback would otherwise run
  // inside.
  let lastFocusedKey: string | undefined;
  createEffect(() => {
    const nextKey = focusedKey();
    const { blurKey, focusKey } = diffFocusedRoute(lastFocusedKey, nextKey);
    if (blurKey === undefined && focusKey === undefined) return;
    lastFocusedKey = nextKey;
    queueMicrotask(() => {
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

  onCleanup(() => {
    if (lastFocusedKey !== undefined) {
      emitterFor(lastFocusedKey).emit(NAVIGATION_EVENT_BLUR);
    }
  });

  function routeFor(routeKey: string): IRoute<unknown> {
    const found = state().routes.find(route => route.key === routeKey);
    return found ?? { key: routeKey, name: '', params: undefined };
  }

  const focusedComponent = createMemo(() => {
    const current = state();
    const route = current.routes[current.index];
    return route === undefined
      ? undefined
      : registry().get(route.name)?.component;
  });

  const content = createMemo(() => {
    const routeKey = focusedKey();
    const Component = focusedComponent();
    return untrack(() => {
      if (routeKey === undefined || Component === undefined) return undefined;
      const scope: INavigationScope = () => ({
        route: routeFor(routeKey),
        navigation: handle,
        emitter: emitterFor(routeKey),
        parent: parentScope?.(),
      });
      return createComponent(NavigationScopeProvider, {
        value: scope,
        get children(): JSX.Element {
          return createComponent(Component, {});
        },
      });
    });
  });

  const descriptors = createMemo<IDrawerDescriptorMap>(() => {
    const map: IDrawerDescriptorMap = {};
    const entries = registry();
    for (const route of state().routes) {
      const entry = entries.get(route.name);
      if (entry === undefined) continue;
      map[route.key] = {
        options: resolveDrawerScreenOptions(entry, {
          route,
          navigation: handle,
        }),
        navigation: handle,
      };
    }
    return map;
  });

  // Called ONCE, untracked, with an accessor - trap §4. Calling it per change (or handing it a
  // value) would rebuild the whole panel subtree on every drawer state change, which mid-gesture is
  // exactly how a responder grant gets lost.
  //
  // LAZY, though, and inside a memo of its OWN - two separate reasons, both load-bearing.
  // (a) Not called from this body directly: the markers have not registered yet at that point, so a
  //     render prop reading `state`/`descriptors` at its own top level (which trap §4 documents as
  //     a frozen read) would snapshot an EMPTY navigator.
  // (b) Not a plain `let` cache either. Whatever computation first CALLS the render prop OWNS every
  //     memo the returned subtree created, and disposes them when it re-runs - so a cached node
  //     handed back to a re-running slot effect is a node whose own reactivity has been torn down,
  //     silently frozen at its first paint. A dependency-free memo has a stable owner (this
  //     component) and runs exactly once, which gives both properties at the same time.
  const drawerContent = createMemo(() =>
    untrack(() =>
      props.drawerContent?.(() => ({
        state: state(),
        descriptors: descriptors(),
        navigation: handle,
      })),
    ),
  );

  const shape = createMemo<IDrawerShape>(
    () => {
      const options = currentOptions();
      return {
        type: resolveDrawerType(options),
        position: resolveDrawerPosition(options),
        animated: isDrawerAnimated(options),
      };
    },
    { type: '', position: '', animated: false },
    { equals: sameDrawerShape },
  );

  function buildDrawer(current: IDrawerShape): ISymbioteNode {
    const order = drawerChildOrder(currentOptions());

    const rootDescriptor = createMemo<IDescriptor>(() => {
      const options = currentOptions();
      return renderDrawer(
        {
          overlayColor: props.overlayColor ?? DRAWER_DEFAULT_OVERLAY_COLOR,
          drawerStyle: props.drawerStyle,
          contentPassthrough: {},
          overlayPassthrough: current.animated
            ? {
                pointerEvents: state().isOpen ? 'auto' : 'none',
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
      );
    });

    function slotDescriptor(slot: IDrawerSlot): IDescriptor {
      const child = rootDescriptor().children[order.indexOf(slot)];
      if (child === undefined || typeof child === 'string') {
        throw new Error(`Drawer: renderDrawer produced no "${slot}" slot`);
      }
      return child;
    }

    // Each animated style holds an AnimatedInterpolation node, not a plain number/colour - it feeds
    // only Animated.View's deliberately permissive `style?: unknown`, never the plain-IViewStyle
    // branch. Recomputed reactively (geometry follows drawerWidth), which reaches the live node as
    // an ordinary prop update rather than a rebuild.
    function animatedStyle(slot: IDrawerSlot): unknown {
      if (!current.animated) return undefined;
      const geometry = resolveDrawerGeometry(currentOptions());
      // Three branches, not one call on a `slot` union: resolveDrawerSlotInterpolation is OVERLOADED
      // per slot (only the overlay's result carries `opacity`), and a union argument matches no
      // overload. The branch is also what makes the opacity read type-safe without a cast.
      if (slot === 'overlay') {
        // The overlay is a full-screen absolutely-positioned sibling BELOW content in paint order;
        // for 'slide' the content itself translates away, so the overlay's translateX shares
        // content's range rather than staying pinned full-screen.
        const overlay = resolveDrawerSlotInterpolation(geometry, 'overlay');
        return {
          opacity: progress.interpolate(overlay.opacity),
          transform: [{ translateX: progress.interpolate(overlay.translateX) }],
        };
      }
      const interpolation =
        slot === 'content'
          ? resolveDrawerSlotInterpolation(geometry, 'content')
          : resolveDrawerSlotInterpolation(geometry, 'panel');
      return {
        transform: [
          { translateX: progress.interpolate(interpolation.translateX) },
        ],
      };
    }

    function slotChildren(slot: IDrawerSlot): JSX.Element {
      if (slot === 'content') return content();
      if (slot === 'panel') return drawerContent();
      return undefined;
    }

    function buildSlot(slot: IDrawerSlot): JSX.Element {
      const style = animatedStyle(slot);
      if (style === undefined) {
        const node = hostElement(
          slotDescriptor(slot).type,
          () => slotDescriptor(slot).props,
        );
        const children = slotChildren(slot);
        if (children !== undefined) insert(node, children);
        return node;
      }
      // ONE source, never a spread followed by an explicit prop: mergeProps takes the first
      // NON-undefined value scanning back-to-front, so a later `undefined` silently loses to an
      // earlier value (.claude/rules/solid-descriptor-bridge.md §6). Collapsing to a single bag
      // removes the question. mergeProps still earns its place - it wraps the function source in a
      // memo and hands Animated.View a reactive proxy, which is what keeps the slot's props live
      // without rebuilding the node.
      return createComponent(
        Animated.View,
        mergeProps((): IAnimatedComponentProps => ({
          ...slotDescriptor(slot).props,
          style: [slotDescriptor(slot).props.style, animatedStyle(slot)],
          get children(): JSX.Element {
            return slotChildren(slot);
          },
        })),
      );
    }

    const root = hostElement('symbiote-view', () => ({
      ...rootDescriptor().props,
      ...panResponder.panHandlers,
    }));
    insert(root, order.map(buildSlot));
    return root;
  }

  const drawer = createMemo(() => {
    const current = shape();
    return untrack(() => buildDrawer(current));
  });

  const host = hostElement('symbiote-view', () => ({ style: { flex: 1 } }));
  insert(host, drawer);

  return createComponent(ScreenCollectorProvider, {
    value: collector,
    get children(): JSX.Element {
      return [props.children, host];
    },
  });
}

export const Drawer = Object.assign(DrawerImpl, { Screen: DrawerScreen });

// --- Explicit gap list vs the real react-native-gesture-handler + react-native-reanimated
// @react-navigation/drawer (mirrored verbatim from the React twin - the gaps are architectural,
// not adapter-specific) ---
// 1. `configureGestureHandler` - a raw react-native-gesture-handler `Gesture` object escape hatch.
//    No PanResponder equivalent exists; not ported.
// 2. Simultaneous/failure gesture RELATIONSHIPS (gesture-handler's declarative composition vs a
//    nested ScrollView, another PanResponder, etc.) - PanResponder only offers negotiation via the
//    should-set boolean gates used here (edge-start + dominant-axis), which is more prone to an
//    accidental hijack of a nested horizontal ScrollView/Swiper.
// 3. `useDrawerProgress` - a Reanimated SharedValue read on the UI thread. `progress` here is a
//    JS-thread AnimatedValue; interpolating it works, but without native-driver wiring it does not
//    carry the same synchronous UI-thread guarantee under JS-thread load.
// 4. `hideStatusBarOnOpen` / `keyboardDismissMode` / `statusBarAnimation` / `overlayStyle` - not
//    wired in this pass; straightforward additions once StatusBar/Keyboard module wiring is needed
//    here (not a PanResponder/Animated limitation, just unscoped for v1).
