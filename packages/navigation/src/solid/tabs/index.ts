// Tab, the Solid lifecycle half. The focused-index router (tab-router-state) and the tab-bar
// Descriptor builder (render-tabs) live in @symbiote-native/navigation core, shared verbatim with
// every other adapter; here Solid supplies the lifecycle - a signal for the dispatched router
// state, a callback `ref` for the jumpTo/setParams handle - plus the descriptor bridge for the
// tab-bar leaf. Unlike Stack, a bottom-tabs bar is a PURE-JS UI painting ordinary
// `symbiote-view`/`symbiote-text` primitives, so there is no react-native-screens ViewConfig to
// register here.
//
// TWO SOLID-ONLY REBUILD BOUNDARIES, both invisible in every other adapter:
//
// 1. THE TAB BAR'S SHAPE FOLLOWS ITS DATA. renderTabBar emits one child per item, and each item
//    emits an icon wrapper only when it has an icon or a badge - so adding a screen, or a badge
//    appearing, CHANGES the Descriptor's shape, which descriptorToSolid's shape guard rejects by
//    design (it builds once and updates props in place). `barSignature` captures exactly the parts
//    of the data the shape depends on, and the bar is rebuilt when that string changes and only
//    then. Every other adapter re-renders the whole bar every time and never meets this.
//
// 2. ONLY THE FOCUSED SCREEN IS MOUNTED, so a focus change is a genuine rebuild while a
//    `setParams` on the focused route must NOT be. The content memo therefore depends on the
//    focused route KEY and its component identity alone, with the build `untrack`ed
//    (.claude/rules/solid-descriptor-bridge.md §5); the route object itself reaches the screen
//    through the scope accessor, which is what keeps useRoute() live without rebuilding anything.

import { createEffect, createMemo, createSignal, untrack } from 'solid-js';
import { descriptorToSolid } from '@symbiote-native/solid';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
// createComponent from solid-js, insert from the renderer - see stack/index.ts's note.
import { createComponent } from 'solid-js';
import { insert } from '@symbiote-native/solid/renderer';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { dlog } from '@symbiote-native/engine';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  createInitialTabState,
  createNavigationEmitter,
  diffFocusedRoute,
  isFocusedRoute,
  reconcileTabRoutes,
  renderTabBar,
  tabRouterReducer,
} from '../../core';
import type {
  INavigationEmitter,
  IRoute,
  ITabBarIcon,
  ITabBarItemView,
  ITabNavigatorHandle,
  ITabOptions,
  ITabRouterAction,
  ITabRouterState,
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
import { TabScreen } from '../screen';
import type {
  ITabScreenOptionsArgs,
  ITabScreenProps,
} from '../tab-screen-props';

export type { ITabNavigatorHandle } from '../../core';

export type ITabProps = {
  initialRouteName?: string;
  screenOptions?: ITabOptions;
  ref?: (handle: ITabNavigatorHandle) => void;
  children?: JSX.Element;
};

const TAB_CONTENT_STYLE = { flex: 1 };
const TAB_ROOT_STYLE = { flex: 1 };

let navigatorSequence = 0;

type ITabScreenEntry = IRegisteredScreen<ITabScreenProps['options']>;

function resolveTabOptions(
  entry: ITabScreenEntry,
  args: ITabScreenOptionsArgs,
  screenOptions: ITabOptions | undefined,
): ITabOptions {
  const own =
    typeof entry.options === 'function' ? entry.options(args) : entry.options;
  return { ...screenOptions, ...own };
}

// A Descriptor icon is spliced into the bar verbatim, so only its ROOT type is visible here - an
// app that swaps one Descriptor icon for another of the same type but a different child count
// would still trip the bridge's shape guard, with the guard's own message. That is the honest
// boundary: this signature covers the shape decisions render-tabs.ts itself makes.
function iconKind(icon: ITabBarIcon | undefined): string {
  if (icon === undefined) return '-';
  return typeof icon === 'string' ? 'glyph' : icon.type;
}

function barSignature(items: readonly ITabBarItemView[]): string {
  return items
    .map(
      item =>
        `${item.key}:${iconKind(item.icon)}:${item.badge === undefined ? 0 : 1}`,
    )
    .join('|');
}

function TabImpl(props: ITabProps): JSX.Element {
  // Read BEFORE this Tab provides its own per-screen scope - becomes the `parent` link a nested
  // screen's useNavigation().getParent() walks. undefined when this Tab is the nesting root.
  const parentScope = useNavigationScope();

  const { screens, collector } = createScreenSignal<
    'tab',
    ITabScreenProps['options']
  >('tab');
  const registry = createMemo(() => toRegistry(screens()));

  navigatorSequence += 1;
  const routeIdPrefix = `tab-${navigatorSequence}`;

  // Route keys are derived from the screen NAME, never a counter: a Tab's route list is rebuilt
  // from the registry on every registration change, and a counter would mint a fresh key each time,
  // re-mounting every screen for an unrelated marker edit.
  const routes = createMemo<readonly IRoute<unknown>[]>(() =>
    [...registry().entries()].map(([name, entry]) => ({
      key: `${routeIdPrefix}-${name}`,
      name,
      params: entry.initialParams,
    })),
  );

  // `null` means nothing has dispatched yet, which is what keeps initialRouteName honored when the
  // markers arrive after the body has already run (screen-registry.ts).
  const [dispatched, setDispatched] = createSignal<ITabRouterState | null>(
    null,
  );

  const state = createMemo<ITabRouterState>(() => {
    const current = routes();
    const previous = dispatched();
    return previous === null
      ? createInitialTabState(current, props.initialRouteName)
      : reconcileTabRoutes(previous, current);
  });

  function dispatch(action: ITabRouterAction): void {
    setDispatched(tabRouterReducer(state(), action));
  }

  const jumpTo = (name: string, params?: unknown): void =>
    dispatch({ type: 'jumpTo', name, params });
  const setParams = (params: unknown, key: string): void =>
    dispatch({ type: 'setParams', key, params });

  const handle: ITabNavigatorHandle = { jumpTo, setParams };
  props.ref?.(handle);

  // One emitter per route.key, created lazily and cached for the navigator's whole lifetime. Emitter
  // IDENTITY (stable, looked up by key) is deliberately decoupled from emit TIMING (deferred below):
  // a scheme that recreated the emitter on each focus change raced the build of the very screen that
  // was supposed to subscribe to it.
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

  // Tab paints its own bar in pure JS - there is no native onAppear/onDisappear to hook (unlike
  // Stack's RNSScreen), so focus/blur is synthesized here. The emit is deferred to a microtask,
  // which resolves only after Solid's whole effect flush has drained - including the build of the
  // newly focused screen and the subscriptions createIsFocused/createFocusEffect register inside
  // it. Emitting inline would reach zero subscribers.
  let lastFocusedKey: string | undefined;
  createEffect(() => {
    const nextKey = focusedKey();
    const { blurKey, focusKey } = diffFocusedRoute(lastFocusedKey, nextKey);
    if (blurKey === undefined && focusKey === undefined) return;
    lastFocusedKey = nextKey;
    queueMicrotask(() => {
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

  const items = createMemo<readonly ITabBarItemView[]>(() => {
    const current = state();
    const entries = registry();
    return current.routes.map((route, index) => {
      const entry = entries.get(route.name);
      const focused = isFocusedRoute(index, current.index);
      if (entry === undefined) {
        dlog(`Tab: no screen registered for route name "${route.name}"`);
        return { key: route.key, focused, label: route.name, passthrough: {} };
      }
      const options = resolveTabOptions(
        entry,
        { route, navigation: handle },
        props.screenOptions,
      );
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
    });
  });

  const focusedOptions = createMemo<ITabOptions | undefined>(() => {
    const current = state();
    const route = current.routes[current.index];
    const entry = route === undefined ? undefined : registry().get(route.name);
    if (entry === undefined || route === undefined) return props.screenOptions;
    return resolveTabOptions(
      entry,
      { route, navigation: handle },
      props.screenOptions,
    );
  });

  // Header note 1: the bar is rebuilt only when its Descriptor SHAPE would change; every tint,
  // label and badge-value change flows through descriptorToSolid's prop diff on the live nodes.
  const barShape = createMemo(() => barSignature(items()));
  const tabBar = createMemo(() => {
    barShape();
    return untrack(() =>
      descriptorToSolid(() =>
        renderTabBar({
          items: items(),
          style: focusedOptions()?.tabBarStyle,
          passthrough: {},
        }),
      ),
    );
  });

  // Header note 2. Only the focused route's screen is ever mounted (unlike Stack, which keeps every
  // pushed route alive), so the previous screen's whole subtree - and every listener it registered
  // - is torn down by Solid's ordinary disposal when focus moves on.
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
        // No route/navigation props: the screen reads both through the primitives off the scope
        // provided here (useRoute / useTabNavigation).
        get children(): JSX.Element {
          return createComponent(Component, {});
        },
      });
    });
  });

  // Reads the CURRENT object for a key rather than closing over the one that was focused at build
  // time - the accessor is what makes `setParams` reach a mounted screen's useRoute().
  function routeFor(routeKey: string): IRoute<unknown> {
    const found = state().routes.find(route => route.key === routeKey);
    return found ?? { key: routeKey, name: '', params: undefined };
  }

  const contentHost = hostElement('symbiote-view', () => ({
    style: TAB_CONTENT_STYLE,
  }));
  insert(contentHost, content);

  const root = hostElement('symbiote-view', () => ({ style: TAB_ROOT_STYLE }));
  // ONE array insert rather than two: a second `insert` on the same parent would find the first
  // child already there and REPLACE it (solid-js/universal's insertExpression), while an array is
  // reconciled by identity - contentHost keeps its node, only the bar is swapped when it rebuilds.
  insert(root, (): readonly ISymbioteNode[] => [contentHost, tabBar()]);

  return createComponent(ScreenCollectorProvider, {
    value: collector,
    get children(): JSX.Element {
      return [props.children, root];
    },
  });
}

export const Tab = Object.assign(TabImpl, { Screen: TabScreen });
