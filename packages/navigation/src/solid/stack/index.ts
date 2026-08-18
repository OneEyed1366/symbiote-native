// Stack, the Solid lifecycle half. The route-stack transitions (navigator-state) and the
// options/props folds (screen-options, render-stack) live in @symbiote-native/navigation core,
// shared verbatim with the React/Vue/Svelte/Angular adapters; here Solid supplies the lifecycle -
// a signal for the pushed-route stack, a route-key counter, a callback `ref` for the push/pop/
// replace handle - plus the descriptor bridge for the header config leaf. Pushing/popping a route
// is an ordinary child insert/remove: RNSScreenStack diffs its RNSScreen children natively, so no
// imperative native command is needed here. Neither this nor the Screen marker imports
// react-native-screens' own React components (they are React internally and crash a non-React
// adapter); the native views are driven through the ViewConfig ../../register registers. See
// CLAUDE.md <third_party_rn_packages_are_react_only>.
//
// FOUR THINGS DIFFER FROM EVERY OTHER ADAPTER, and each is a place a naive port freezes:
//
// 1. THE REGISTRY IS EMPTY WHEN THIS BODY RUNS. Solid cannot inspect children (screen-registry.ts),
//    and the markers only register once the collector Provider evaluates them - after the body has
//    returned. So nothing is computed eagerly from the registry: the initial state is seeded lazily
//    by `seed()` the first time a non-empty registry is observed.
//
// 2. ROUTES ARE KEYED BY `route.key`, NOT BY THE ROUTE OBJECT. `setParams` produces a NEW route
//    object under the same key. A `<For each={routes()}>` keys on object identity and would tear a
//    screen's whole subtree down and rebuild it on every setParams - losing native-owned state and
//    every ref. Iterating the KEYS (a memo with an element-wise `equals`) makes a params change
//    invisible to the list and visible only to the leaf accessors that read it.
//
// 3. THE SCREEN IS BUILT BEHIND AN EXPLICIT REBUILD BOUNDARY. Three things legitimately change a
//    route's native SHAPE rather than its props: `screenViewName` (RN treats RNSModalScreen as a
//    different view from RNSScreen), `inModal` (a modal nests an inner stack purely to host the
//    header - isHeaderInModal in core/render-stack.ts), and whether the header config carries a
//    search-bar child. Each is read in a `createMemo` over those discriminators ALONE with the
//    build `untrack`ed - the shape .claude/rules/solid-descriptor-bridge.md §5 prescribes. Without
//    the untrack the memo subscribes to every prop the build reads and re-creates the native screen
//    on each header-title change. The screen COMPONENT is its own, narrower boundary inside that.
//
// 4. FOCUS/STATE EMISSION IS DEFERRED BY A MICROTASK. A screen's subtree - and the subscriptions
//    createIsFocused/createNavigationState set up inside it - is built by the render effects of the
//    very update that changed the state, so an inline emit would reach zero subscribers.

import {
  For,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from 'solid-js';
import type { Accessor } from 'solid-js';
import { descriptorToSolid } from '@symbiote-native/solid';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
// `createComponent` comes from solid-js, not from the renderer: they are the SAME runtime call
// (untrack + invoke), but the renderer's is typed to return a host node, which a Solid component
// legitimately does not have to (a screen may render nothing). `insert`/`insertNode` are the
// renderer's own, since they mutate the engine tree.
import { createComponent } from 'solid-js';
import { insert, insertNode } from '@symbiote-native/solid/renderer';
import {
  Platform,
  debugNodeId,
  dlog,
  isSymbioteNode,
} from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  NAVIGATION_EVENT_STATE,
  RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME,
  RNS_SCREEN_STACK_VIEW_NAME,
  RNS_SCREEN_VIEW_NAME,
  SCREEN_ON_APPEAR,
  SCREEN_ON_DISAPPEAR,
  SCREEN_ON_DISMISSED,
  SCREEN_ON_HEADER_BACK_BUTTON_CLICKED,
  SCREEN_ON_WILL_APPEAR,
  SCREEN_ON_WILL_DISAPPEAR,
  STACK_ON_FINISH_TRANSITIONING,
  buildSearchBarHandle,
  buildSearchBarPassthrough,
  createInitialNavigatorState,
  createNavigationEmitter,
  navigatorReducer,
  reconcileStackRoutes,
  resolveScreenRenderPlan,
  resolveStackProps,
} from '../../core';
import type {
  INavigationEmitter,
  INavigatorHandle,
  INavigatorPlatform,
  INavigatorState,
  IRoute,
  IScreenRenderPlan,
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
import { Screen } from '../screen';
import type {
  IScreenOptionsArgs,
  IScreenProps,
  ISolidScreenOptions,
} from '../screen-props';

export type { INavigatorHandle } from '../../core';

// React's `children?: ReactNode` and Vue's default slot become Solid's `children` - the markers,
// which register themselves rather than being scanned. `ref` is Solid's own spelling of Vue's
// `expose()`: a callback the compiler hands the navigator handle.
export type IStackProps = {
  initialRouteName?: string;
  screenOptions?: ISolidScreenOptions;
  ref?: (handle: INavigatorHandle) => void;
  children?: JSX.Element;
};

// backTitleVisible defaults to `true` on both platforms per the codegen spec's own default
// (CT.WithDefault<boolean, 'true'>) - no ios/android divergence in v1 scope.
const NAVIGATOR_PLATFORM: INavigatorPlatform = {
  defaultHeaderBackTitleVisible: true,
};

const EMPTY_STATE: INavigatorState = { routes: [] };

// Route keys must be unique per navigator INSTANCE. React/Vue take that from useId(); Solid has no
// equivalent, so a module counter stands in - read once, at construction.
let navigatorSequence = 0;

type IStackScreenEntry = IRegisteredScreen<IScreenProps['options']>;

// What makes a route's NATIVE shape different rather than just its props (header note 3).
type IScreenShape = {
  viewName: string;
  inModal: boolean;
  hasSearchBar: boolean;
};

function sameShape(a: IScreenShape, b: IScreenShape): boolean {
  return (
    a.viewName === b.viewName &&
    a.inModal === b.inModal &&
    a.hasSearchBar === b.hasSearchBar
  );
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

function resolveScreenOptions(
  entry: IStackScreenEntry,
  args: IScreenOptionsArgs,
  screenOptions: ISolidScreenOptions | undefined,
): ISolidScreenOptions {
  const own =
    typeof entry.options === 'function' ? entry.options(args) : entry.options;
  return { ...screenOptions, ...own };
}

function StackImpl(props: IStackProps): JSX.Element {
  // Read BEFORE this Stack provides its own per-screen scope below - becomes the `parent` link a
  // nested screen's useNavigation().getParent() walks. undefined when this Stack is the root.
  const parentScope = useNavigationScope();

  const { screens, collector } = createScreenSignal<
    'stack',
    IScreenProps['options']
  >('stack');
  const registry = createMemo(() => toRegistry(screens()));

  navigatorSequence += 1;
  const routeIdPrefix = `stack-${navigatorSequence}`;
  let routeSequence = 0;

  function createRoute(name: string, params: unknown): IRoute<unknown> {
    routeSequence += 1;
    return { key: `${routeIdPrefix}-${name}-${routeSequence}`, name, params };
  }

  // One emitter per route.key, created lazily and pruned once the route is popped (below).
  const emitters = new Map<string, INavigationEmitter>();
  function emitterFor(routeKey: string): INavigationEmitter {
    let emitter = emitters.get(routeKey);
    if (emitter === undefined) {
      emitter = createNavigationEmitter();
      emitters.set(routeKey, emitter);
    }
    return emitter;
  }

  const [dispatched, setDispatched] = createSignal<INavigatorState | null>(
    null,
  );

  // The initial push, deferred until the markers have registered (header note 1). Cached in a plain
  // local rather than a memo: it must run EXACTLY once - a memo re-running would mint a second
  // route key for the same screen and silently reset the stack.
  let seeded: INavigatorState | undefined;
  function seed(entries: Map<string, IStackScreenEntry>): INavigatorState {
    if (seeded !== undefined) return seeded;
    // Deliberately NOT seeded from an empty registry, even when `initialRouteName` names the route:
    // <For> maps a key exactly once, so a route minted before its marker exists would be handed a
    // build with no component and stay blank forever. Waiting one update costs nothing - the
    // markers register during the same flush this navigator is created in.
    if (entries.size === 0) {
      dlog('Stack: no <Stack.Screen> children registered');
      return EMPTY_STATE;
    }
    const initialRouteName =
      props.initialRouteName ?? entries.keys().next().value;
    if (initialRouteName === undefined) return EMPTY_STATE;
    seeded = createInitialNavigatorState(
      createRoute(
        initialRouteName,
        entries.get(initialRouteName)?.initialParams,
      ),
    );
    return seeded;
  }

  // A <Stack.Screen> marker can vanish while its route is still in the pushed history, which would
  // leave that entry with nothing to render (reconcileStackRoutes' header). Reconciling on READ
  // keeps the repair out of any write path; the next dispatch then persists it.
  const currentState = createMemo<INavigatorState>(() => {
    const entries = registry();
    const state = dispatched();
    if (state === null) return seed(entries);
    return reconcileStackRoutes(state, [...entries.keys()]);
  });

  function dispatch(action: Parameters<typeof navigatorReducer>[1]): void {
    setDispatched(navigatorReducer(currentState(), action));
  }

  const handle: INavigatorHandle = {
    push: (name, params) =>
      dispatch({ type: 'push', route: createRoute(name, params) }),
    pop: count => dispatch({ type: 'pop', count }),
    popToTop: () => dispatch({ type: 'popToTop' }),
    popTo: key => dispatch({ type: 'popTo', key }),
    replace: (name, params) =>
      dispatch({ type: 'replace', route: createRoute(name, params) }),
    setParams: (params, key) => dispatch({ type: 'setParams', key, params }),
    reset: nextState => dispatch({ type: 'reset', state: nextState }),
    canGoBack: () => currentState().routes.length > 1,
  };
  props.ref?.(handle);

  // Broadcasts the router state to every still-live route's emitter (createNavigationState's
  // source) and prunes emitters for popped routes. Deferred by a microtask - header note 4.
  createEffect(() => {
    const current = currentState();
    queueMicrotask(() => {
      for (const route of current.routes) {
        emitterFor(route.key).emit(NAVIGATION_EVENT_STATE, current);
      }
      for (const routeKey of [...emitters.keys()]) {
        if (!current.routes.some(route => route.key === routeKey)) {
          emitters.delete(routeKey);
        }
      }
    });
  });

  // Header note 2: keyed on route KEYS, so a setParams (new route object, same key) never reaches
  // <For> and never rebuilds a screen subtree.
  const routeKeys = createMemo<readonly string[]>(
    () => currentState().routes.map(route => route.key),
    [],
    { equals: sameKeys },
  );

  function renderRoute(routeKey: string, index: Accessor<number>): JSX.Element {
    const route = createMemo(() =>
      currentState().routes.find(candidate => candidate.key === routeKey),
    );
    const entry = createMemo(() => {
      const current = route();
      return current === undefined ? undefined : registry().get(current.name);
    });
    const emitter = emitterFor(routeKey);
    // The host node the app's search-bar ref last saw. `spread` re-runs a bag's `ref` on EVERY prop
    // change, and an app expects one attach per node the way React's ref contract gives it.
    let lastSearchBarNode: ISymbioteNode | null = null;

    // Keeping the PREVIOUS plan when the route or its marker vanishes: <For> disposes this item in
    // the same update, but memo evaluation order inside one batch is not ours to choose, so the
    // live prop accessors below must never observe an undefined plan mid-teardown.
    const plan = createMemo<IScreenRenderPlan | undefined>(previous => {
      const current = route();
      const registered = entry();
      if (current === undefined || registered === undefined) return previous;

      const merged = resolveScreenOptions(
        registered,
        { route: current, navigation: handle },
        props.screenOptions,
      );
      const searchBarOptions = merged.headerSearchBarOptions;

      return resolveScreenRenderPlan({
        screenId: current.key,
        index: index(),
        routeCount: currentState().routes.length,
        options: merged,
        platform: NAVIGATOR_PLATFORM,
        isAndroid: Platform.OS === 'android',
        screenPassthrough: {
          [SCREEN_ON_DISMISSED]: () => dispatch({ type: 'pop', count: 1 }),
          [SCREEN_ON_HEADER_BACK_BUTTON_CLICKED]: () =>
            dispatch({ type: 'pop', count: 1 }),
          // onAppear/onDisappear are the definitive visibility boundary (post-transition), so
          // 'focus'/'blur' fire exactly once per transition; onWillAppear/onWillDisappear fire
          // BEFORE the animation and would double-invoke createFocusEffect, so they only log.
          [SCREEN_ON_WILL_APPEAR]: () =>
            dlog(
              `Stack: route "${current.name}" will appear at t=${Date.now()}`,
            ),
          [SCREEN_ON_APPEAR]: () => {
            dlog(
              `Stack: route "${current.name}" appeared (focus) at t=${Date.now()}`,
            );
            emitter.emit(NAVIGATION_EVENT_FOCUS);
          },
          [SCREEN_ON_WILL_DISAPPEAR]: () =>
            dlog(
              `Stack: route "${current.name}" will disappear at t=${Date.now()}`,
            ),
          [SCREEN_ON_DISAPPEAR]: () => {
            dlog(
              `Stack: route "${current.name}" disappeared (blur) at t=${Date.now()}`,
            );
            emitter.emit(NAVIGATION_EVENT_BLUR);
          },
        },
        searchBarPassthrough:
          searchBarOptions === undefined
            ? undefined
            : {
                ...buildSearchBarPassthrough(searchBarOptions, message =>
                  dlog(`Stack: route "${current.name}" ${message}`),
                ),
                // The imperative ref (ISearchBarCommands): `spread` calls a `ref` found in the bag
                // with the host node, so it rides down inside passthrough untouched.
                ref: (element: unknown): void => {
                  const node = isSymbioteNode(element) ? element : null;
                  if (node === lastSearchBarNode) return;
                  lastSearchBarNode = node;
                  dlog(
                    `Stack: search bar ref, node=${node === null ? 'null' : debugNodeId(node)}`,
                  );
                  searchBarOptions.ref?.(
                    node === null ? null : buildSearchBarHandle(() => node),
                  );
                },
              },
      });
    }, undefined);

    // NOT an early `return undefined` when the plan is still unresolved. <For> maps a key exactly
    // ONCE, so bailing here would strand the route with nothing to paint for the rest of its life -
    // and an unresolved plan is the NORMAL first state, since the markers register after the
    // navigator's body has run (header note 1).
    const shape = createMemo<IScreenShape | undefined>(
      () => {
        const current = plan();
        if (current === undefined) return undefined;
        return {
          viewName: current.screenViewName,
          inModal: current.inModal,
          hasSearchBar: current.searchBarProps !== undefined,
        };
      },
      undefined,
      {
        equals: (a, b) =>
          a === b || (a !== undefined && b !== undefined && sameShape(a, b)),
      },
    );

    function buildScreen(current: IScreenShape): ISymbioteNode | undefined {
      // Re-read rather than closed over: this runs on every rebuild boundary crossing, and the
      // fallbacks below keep the live accessors from ever seeing `undefined` mid-teardown.
      const builtPlan = plan();
      const builtRoute = route();
      const builtEntry = entry();
      if (
        builtPlan === undefined ||
        builtRoute === undefined ||
        builtEntry === undefined
      ) {
        dlog(`Stack: no screen registered for route key "${routeKey}"`);
        return undefined;
      }
      const livePlan = (): IScreenRenderPlan => plan() ?? builtPlan;
      const liveRoute = (): IRoute<unknown> => route() ?? builtRoute;
      const initialComponent = builtEntry.component;

      const scope: INavigationScope = () => ({
        route: liveRoute(),
        navigation: handle,
        emitter,
        parent: parentScope?.(),
      });

      // The narrower boundary inside the shape one: a screen swapping its `component` rebuilds only
      // the body, never the native screen.
      const component = createMemo(
        () => entry()?.component ?? initialComponent,
      );

      // Must not be flattened away (collapsable: false, supplied by contentWrapperProps) -
      // react-native-screens' native side finds THIS view type by class check to register a
      // formSheet's content for sizing (RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME in core/constants.ts).
      const contentWrapper = hostElement(
        RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME,
        () => livePlan().contentWrapperProps,
      );
      insert(
        contentWrapper,
        createComponent(NavigationScopeProvider, {
          value: scope,
          // The screen component is created HERE, inside the Provider's own children resolution,
          // not in a memo declared above it - a Solid computation captures its owner at CREATION,
          // so a component built outside this getter would run with the enclosing owner and see no
          // navigation scope at all (useRoute would throw). Reading `component()` tracked makes the
          // getter the rebuild boundary for a component swap; `untrack` around the build keeps the
          // screen's own prop reads out of that boundary. No route/navigation props: the screen
          // reads both through the primitives off the scope provided here.
          get children(): JSX.Element {
            const Component = component();
            return untrack(() => createComponent(Component, {}));
          },
        }),
      );

      // The header config (and its RNSSearchBar child, when the screen has one) is a pure
      // Descriptor leaf, so it goes through the shared bridge verbatim, exactly like React's and
      // Vue's do. Its child COUNT is part of `shape` above, which is what keeps the bridge's
      // shape-stability contract satisfied when an app adds or removes headerSearchBarOptions.
      const headerConfig = descriptorToSolid(() => livePlan().headerConfig);

      const screen = hostElement(
        current.viewName,
        () => livePlan().screenProps,
      );
      if (!current.inModal) {
        insertNode(screen, headerConfig);
        insertNode(screen, contentWrapper);
        return screen;
      }

      // A modal/formSheet screen has no UINavigationController of its own on iOS - nest an inner
      // RNSScreenStack/RNSScreen purely to host the native header bar. Skipping this leaves
      // RNSScreenStackHeaderConfig with no navigation controller to attach to, so the header
      // silently never renders.
      const innerStack = hostElement(RNS_SCREEN_STACK_VIEW_NAME, () => ({
        style: livePlan().innerStackStyle,
      }));
      // activityState mirrors the outer Screen's - RNSScreen.mm treats an unset/inactive nested
      // screen as not yet pushed, leaving it parked at its pre-push transition position (off past
      // the bottom edge) instead of its real, presented frame.
      const innerScreen = hostElement(RNS_SCREEN_VIEW_NAME, () => ({
        style: livePlan().innerScreenStyle,
        activityState: livePlan().activityState,
      }));
      insertNode(innerScreen, headerConfig);
      insertNode(innerScreen, contentWrapper);
      insertNode(innerStack, innerScreen);
      insertNode(screen, innerStack);
      return screen;
    }

    return createMemo(() => {
      const current = shape();
      if (current === undefined) return undefined;
      return untrack(() => buildScreen(current));
    });
  }

  // Investigation instrumentation (flicker-on-focus bug): STACK_ON_FINISH_TRANSITIONING is the
  // native signal that the WHOLE push/pop animation finished, as opposed to the per-screen
  // onAppear/onDisappear. Kept behind DEBUG, never removed.
  const stackProps = resolveStackProps({
    passthrough: {
      [STACK_ON_FINISH_TRANSITIONING]: () =>
        dlog(`Stack: onFinishTransitioning at t=${Date.now()}`),
    },
  });

  const root = hostElement(RNS_SCREEN_STACK_VIEW_NAME, () => stackProps);
  // The <For> component is created EAGERLY and handed to `insert` as a value, never as
  // `() => createComponent(For, …)`. The latter would read `each` inside insert's own render
  // effect, so every route change would re-create the whole list instead of letting For's keyed
  // mapping reuse the screens it already built.
  insert(
    root,
    createComponent(For, {
      get each(): readonly string[] {
        return routeKeys();
      },
      children: renderRoute,
    }),
  );

  onCleanup(() => emitters.clear());

  // `props.children` is READ here and nowhere else: reading it is what CREATES the markers, and
  // they must be created inside this Provider so their collectStackScreen() finds the collector on
  // the owner chain. They paint nothing, so the array is effectively just `root` - and `root` is a
  // pre-built node reference, so a marker list that changes re-runs this getter without disturbing
  // the navigator tree.
  return createComponent(ScreenCollectorProvider, {
    value: collector,
    get children(): JSX.Element {
      return [props.children, root];
    },
  });
}

export const Stack = Object.assign(StackImpl, { Screen });
