// Vue twin of the React `Stack` test, run against an injected codegen-shaped ViewConfig
// Imported from `./index`, not the package barrel, so `../register` never loads headless

// Reducer transitions are core's own tests, this file proves only the lifecycle wiring into them

// No Negative group: popping the last route is a no-op the reducer already fails closed on

import { Fragment, defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/vue';
import type { INativeViewConfig } from '@symbiote-native/engine';
import {
  childrenOf,
  isAnchor,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';
import { Stack } from './index';
import type { INavigatorHandle } from './index';
import { useRoute } from '../composables';
import type {
  INavigatorState,
  IScreenOptionsResolver,
  ISearchBarCommands,
} from '../../core';
import type { IVueScreenOptions } from '../screen';

const ROOT_TAG = 4_512;
const SCREEN_VIEW = 'RNSScreen';
const STACK_VIEW = 'RNSScreenStack';
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';
const HEADER_SUBVIEW_VIEW = 'RNSScreenStackHeaderSubview';
const SEARCH_BAR_VIEW = 'RNSSearchBar';
const MODAL_SCREEN_VIEW = 'RNSModalScreen';
const SHEET_FOOTER_VIEW = 'RNSScreenFooter';

function directEvent(registrationName: string) {
  return { registrationName };
}

const RNS_SCREEN_VIEW_CONFIG = {
  directEventTypes: {
    topAppear: directEvent('onAppear'),
    topDisappear: directEvent('onDisappear'),
    topWillAppear: directEvent('onWillAppear'),
    topWillDisappear: directEvent('onWillDisappear'),
    topDismissed: directEvent('onDismissed'),
    topHeaderBackButtonClicked: directEvent('onHeaderBackButtonClicked'),
  },
  validAttributes: {
    screenId: true,
    activityState: true,
    gestureEnabled: true,
    stackAnimation: true,
    stackPresentation: true,
    transitionDuration: true,
  },
};

const RNS_SCREEN_STACK_VIEW_CONFIG = {
  directEventTypes: {
    topFinishTransitioning: directEvent('onFinishTransitioning'),
  },
  validAttributes: { nativeContainerBackgroundColor: true },
};

const RNS_HEADER_CONFIG_VIEW_CONFIG = {
  directEventTypes: {
    topPressHeaderBarButtonItem: directEvent('onPressHeaderBarButtonItem'),
  },
  validAttributes: {
    title: true,
    hidden: true,
    backTitle: true,
    backTitleVisible: true,
  },
};

const RNS_SEARCH_BAR_VIEW_CONFIG = {
  directEventTypes: {
    topSearchFocus: directEvent('onSearchFocus'),
    topSearchBlur: directEvent('onSearchBlur'),
    topChangeText: directEvent('onChangeText'),
    topSearchButtonPress: directEvent('onSearchButtonPress'),
    topCancelButtonPress: directEvent('onCancelButtonPress'),
    topClose: directEvent('onClose'),
    topOpen: directEvent('onOpen'),
  },
  validAttributes: { placeholder: true },
};

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: RNS_SCREEN_VIEW_CONFIG,
  [STACK_VIEW]: RNS_SCREEN_STACK_VIEW_CONFIG,
  [HEADER_CONFIG_VIEW]: RNS_HEADER_CONFIG_VIEW_CONFIG,
  [SEARCH_BAR_VIEW]: RNS_SEARCH_BAR_VIEW_CONFIG,
  [MODAL_SCREEN_VIEW]: RNS_SCREEN_VIEW_CONFIG,
  [SHEET_FOOTER_VIEW]: {
    directEventTypes: {},
    validAttributes: { collapsable: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// A POP is the subject of half this file, so every walk below descends the LIVE child links from
// the stack container down. A recording keeps every node it ever saw created, so a popped screen
// is still in the record and only the tree says it is gone.
function stackRoot(): ISymbioteNode {
  const stack = fabric.find(node => node.viewName === STACK_VIEW);
  if (stack === undefined) throw new Error('no screen stack created');
  return stack.handle;
}

// Anchors are FLATTENED, the commit walk's own rule (`renderableChildren`): an anchor is
// structural bookkeeping nothing native ever sees, so its children stand in its place. The counts
// below therefore mean NATIVE children.
function kidsOf(node: IAuthoredNode): IAuthoredNode[] {
  const walk = (handle: ISymbioteNode): IAuthoredNode[] => {
    const kids: IAuthoredNode[] = [];
    for (const child of childrenOf(handle)) {
      if (isAnchor(child)) {
        kids.push(...walk(child));
        continue;
      }
      const recorded = fabric.find(one => one.handle === child);
      if (recorded !== undefined) kids.push(recorded);
    }
    return kids;
  };
  return walk(node.handle);
}

function liveNodes(handle: ISymbioteNode = stackRoot()): IAuthoredNode[] {
  const found: IAuthoredNode[] = [];
  for (const child of childrenOf(handle)) {
    const recorded = fabric.find(one => one.handle === child);
    if (recorded !== undefined) found.push(recorded);
    found.push(...liveNodes(child));
  }
  return found;
}

function findInTree(
  predicate: (node: IAuthoredNode) => boolean,
): IAuthoredNode | undefined {
  return liveNodes().find(predicate);
}

function screenNodes(): IAuthoredNode[] {
  return liveNodes().filter(node => node.viewName === SCREEN_VIEW);
}

function headerConfigOf(screen: IAuthoredNode): IAuthoredNode {
  const header = kidsOf(screen).find(
    child => child.viewName === HEADER_CONFIG_VIEW,
  );
  if (!header) throw new Error('no header config child on screen');
  return header;
}

// header config -> the one subview -> the search bar itself.
function searchBarNode(): IAuthoredNode {
  return kidsOf(kidsOf(headerConfigOf(screenNodes()[0]))[0])[0];
}

function HomeScreen() {
  return h('text', {}, 'home');
}

function DetailsScreen() {
  return h('text', {}, 'details');
}

function mountStack(
  handleRef: ReturnType<typeof ref<INavigatorHandle | null>>,
  children: unknown[],
) {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h(Stack, { ref: handleRef, initialRouteName: 'Home' }, () => children),
    }),
  );
}

function ProfileScreen() {
  return h('text', {}, 'profile');
}

// A slot whose marker list is REACTIVE - the Vue shape of "a <Stack.Screen> behind a v-if", which
// mountStack's fixed array cannot express.
function mountDynamicStack(
  handleRef: ReturnType<typeof ref<INavigatorHandle | null>>,
  isDetailsRegistered: ReturnType<typeof ref<boolean>>,
) {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h(Stack, { ref: handleRef, initialRouteName: 'Home' }, () => [
          h(Stack.Screen, { name: 'Home', component: HomeScreen }),
          ...(isDetailsRegistered.value === true
            ? [h(Stack.Screen, { name: 'Details', component: DetailsScreen })]
            : []),
          h(Stack.Screen, { name: 'Profile', component: ProfileScreen }),
        ]),
    }),
  );
}

describe('Vue Stack navigator', () => {
  describe('Positive', () => {
    // Монтируется только начальный маршрут, с `activityState` 2, его title доходит до header config
    it('mounts only the initial route as an RNSScreen, focused', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { initialRouteName: 'Home' }, () => [
              h(Stack.Screen, {
                name: 'Home',
                component: HomeScreen,
                options: { title: 'Home' },
              }),
              h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
            ]),
        }),
      );
      await tick();
      const screens = screenNodes();
      expect(screens).toHaveLength(1);
      expect(screens[0].props.activityState).toBe(2);
      expect(fabric.find(n => n.viewName === STACK_VIEW)).toBeDefined();
      expect(headerConfigOf(screens[0]).props.title).toBe('Home');
    });

    it('paints the stack container with nativeContainerStyle.backgroundColor', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(
              Stack,
              {
                initialRouteName: 'Home',
                nativeContainerStyle: { backgroundColor: '#112233' },
              },
              () => [h(Stack.Screen, { name: 'Home', component: HomeScreen })],
            ),
        }),
      );
      await tick();
      const stack = fabric.find(node => node.viewName === STACK_VIEW);
      expect(stack?.props.nativeContainerBackgroundColor).toBeDefined();
    });

    // `RNSScreen` не допускает снижения `activityState`, поэтому после push оба маршрута на 2
    it('push() mounts a second RNSScreen and keeps the first at activityState 2', async () => {
      const handleRef = ref<INavigatorHandle | null>(null);
      mountStack(handleRef, [
        h(Stack.Screen, { name: 'Home', component: HomeScreen }),
        h(Stack.Screen, {
          name: 'Details',
          component: DetailsScreen,
          options: { title: 'Details' },
        }),
      ]);
      await tick();
      handleRef.value?.push('Details');
      await tick();
      const screens = screenNodes();
      expect(screens).toHaveLength(2);
      expect(screens[0].props.activityState).toBe(2);
      expect(screens[1].props.activityState).toBe(2);
      expect(headerConfigOf(screens[1]).props.title).toBe('Details');
      expect(handleRef.value?.canGoBack()).toBe(true);
    });

    // why: pop() must unmount the top RNSScreen (an ordinary child unmount - no imperative native
    // command needed) back down to the previous route, and canGoBack() must reflect the new depth.
    it('pop() unmounts back down to the previous route', async () => {
      const handleRef = ref<INavigatorHandle | null>(null);
      mountStack(handleRef, [
        h(Stack.Screen, { name: 'Home', component: HomeScreen }),
        h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
      ]);
      await tick();
      handleRef.value?.push('Details');
      await tick();
      expect(screenNodes()).toHaveLength(2);
      handleRef.value?.pop();
      await tick();
      expect(screenNodes()).toHaveLength(1);
      expect(handleRef.value?.canGoBack()).toBe(false);
    });

    // `v-for` в слоте Stack компилируется во `Fragment`, его экраны остаются маршрутами
    it('push() reaches a screen declared inside a Fragment (v-for)', async () => {
      const handleRef = ref<INavigatorHandle | null>(null);
      mountStack(handleRef, [
        h(Stack.Screen, { name: 'Home', component: HomeScreen }),
        h(Fragment, null, [
          h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
        ]),
      ]);
      await tick();
      handleRef.value?.push('Details');
      await tick();
      expect(screenNodes()).toHaveLength(2);
    });

    // Состояние экрана живёт между его обновлениями: экран не пересоздаётся при смене своего ref
    it('keeps a screen mounted while its own state changes', async () => {
      let setups = 0;
      const count = ref(0);
      const CounterScreen = defineComponent({
        setup: () => {
          setups += 1;
          return () => h('text', {}, `count ${count.value}`);
        },
      });
      mountStack(ref<INavigatorHandle | null>(null), [
        h(Stack.Screen, { name: 'Home', component: CounterScreen }),
      ]);
      await tick();
      count.value = 1;
      await tick();
      count.value = 2;
      await tick();
      expect(setups).toBe(1);
    });

    // why: popping the last route must be a silent no-op (fail closed), not an empty stack -
    // matches core's own reducer contract, observed here as an unchanged screen count.
    it('refuses to pop the last route', async () => {
      const handleRef = ref<INavigatorHandle | null>(null);
      mountStack(handleRef, [
        h(Stack.Screen, { name: 'Home', component: HomeScreen }),
      ]);
      await tick();
      handleRef.value?.pop();
      await tick();
      expect(screenNodes()).toHaveLength(1);
    });

    // An iOS swipe-back fires `onDismissed` with no JS pop call, so `Stack` must pop on that event
    it('drives a pop from the native onDismissed event (iOS swipe/interactive dismiss)', async () => {
      const handleRef = ref<INavigatorHandle | null>(null);
      mountStack(handleRef, [
        h(Stack.Screen, { name: 'Home', component: HomeScreen }),
        h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
      ]);
      await tick();
      handleRef.value?.push('Details');
      await tick();
      expect(screenNodes()).toHaveLength(2);
      const top = screenNodes()[1];
      fabric.fireEvent(top.instanceHandle, 'topDismissed', { dismissCount: 1 });
      await tick();
      expect(screenNodes()).toHaveLength(1);
    });

    // why: tapping the native header back button is a second native-driven pop trigger, wired
    // separately from onDismissed (see stack.ts's screenPassthrough) - both must reach the same
    // dispatch({ type: 'pop' }).
    it('drives a pop from the native onHeaderBackButtonClicked event', async () => {
      const handleRef = ref<INavigatorHandle | null>(null);
      mountStack(handleRef, [
        h(Stack.Screen, { name: 'Home', component: HomeScreen }),
        h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
      ]);
      await tick();
      handleRef.value?.push('Details');
      await tick();
      const top = screenNodes()[1];
      fabric.fireEvent(top.instanceHandle, 'topHeaderBackButtonClicked', {});
      await tick();
      expect(screenNodes()).toHaveLength(1);
    });

    // why: Stack must mount the app's REGISTERED component as the RNSScreen's content, not a
    // placeholder - proves the slot-scan registry lookup (collectRegistry) actually wires through
    // to render.
    it('mounts the registered screen component as the RNSScreen content', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { initialRouteName: 'Home' }, () => [
              h(Stack.Screen, { name: 'Home', component: HomeScreen }),
            ]),
        }),
      );
      await tick();
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home'),
      ).toBeDefined();
    });

    // why: params passed to push() must reach the pushed screen's own useRoute() - the same route
    // object Stack builds, not a re-derived or stale copy.
    it('exposes route.params to the screen via useRoute() after navigation.push', async () => {
      let receivedParams: unknown;
      const ParamsScreen = defineComponent(() => {
        const route = useRoute();
        return () => {
          receivedParams = route.value.params;
          return h('text', {}, 'params');
        };
      });
      const handleRef = ref<INavigatorHandle | null>(null);
      mountStack(handleRef, [
        h(Stack.Screen, { name: 'Home', component: HomeScreen }),
        h(Stack.Screen, { name: 'Details', component: ParamsScreen }),
      ]);
      await tick();
      handleRef.value?.push('Details', { id: 42 });
      await tick();
      expect(receivedParams).toEqual({ id: 42 });
    });

    // why: setParams() must MERGE onto the focused route in place - the stack's shape (which routes
    // are mounted) must not change, only that one route's params.
    it('setParams() merges onto the focused route without changing the stack shape', async () => {
      let receivedParams: unknown;
      const ParamsScreen = defineComponent(() => {
        const route = useRoute();
        return () => {
          receivedParams = route.value.params;
          return h('text', {}, 'params');
        };
      });
      const handleRef = ref<INavigatorHandle | null>(null);
      mountStack(handleRef, [
        h(Stack.Screen, { name: 'Home', component: HomeScreen }),
        h(Stack.Screen, { name: 'Details', component: ParamsScreen }),
      ]);
      await tick();
      handleRef.value?.push('Details', { id: 1 });
      await tick();
      handleRef.value?.setParams({ id: 2 });
      await tick();
      expect(receivedParams).toEqual({ id: 2 });
      expect(screenNodes()).toHaveLength(2);
    });

    // A demo panel steers the header with route params, so `setParams` has to re-run the resolver
    it('setParams() re-runs an options resolver, the header follows the params', async () => {
      const titleOf = (params: unknown): string => {
        if (typeof params !== 'object' || params === null) return '';
        const record: Record<string, unknown> = { ...params };
        return typeof record.label === 'string' ? record.label : '';
      };
      const resolver: IScreenOptionsResolver = ({ route }) => ({
        title: titleOf(route.params),
      });
      const handleRef = ref<INavigatorHandle | null>(null);
      mountStack(handleRef, [
        h(Stack.Screen, { name: 'Home', component: HomeScreen }),
        h(Stack.Screen, {
          name: 'Details',
          component: DetailsScreen,
          options: resolver,
        }),
      ]);
      await tick();
      handleRef.value?.push('Details', { label: 'first' });
      await tick();
      expect(headerConfigOf(screenNodes()[1]).props.title).toBe('first');
      handleRef.value?.setParams({ label: 'second' });
      await tick();
      expect(headerConfigOf(screenNodes()[1]).props.title).toBe('second');
    });

    // why: setParams(params, key) must target the NAMED route, not just whichever one is currently
    // focused - the mechanism a screen deep in the stack uses to update its own params from afar.
    it('setParams() targets a route by key when given, not just the focused one', async () => {
      let homeKey: string | undefined;
      let homeParams: unknown;
      const HomeTrackingScreen = defineComponent(() => {
        const route = useRoute();
        return () => {
          homeKey = route.value.key;
          homeParams = route.value.params;
          return h('text', {}, 'home');
        };
      });
      const handleRef = ref<INavigatorHandle | null>(null);
      mountStack(handleRef, [
        h(Stack.Screen, {
          name: 'Home',
          component: HomeTrackingScreen,
          initialParams: { tab: 'feed' },
        }),
        h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
      ]);
      await tick();
      handleRef.value?.push('Details');
      await tick();
      if (homeKey === undefined)
        throw new Error('home route key was never captured');
      handleRef.value?.setParams({ tab: 'search' }, homeKey);
      await tick();
      expect(homeParams).toEqual({ tab: 'search' });
    });

    // why: reset() must replace the WHOLE stack atomically - a fresh route list, not a diff against
    // the old one, including a route the app never pushed through push()/replace().
    it('reset() replaces the whole stack with the given state', async () => {
      const handleRef = ref<INavigatorHandle | null>(null);
      mountStack(handleRef, [
        h(Stack.Screen, { name: 'Home', component: HomeScreen }),
        h(Stack.Screen, {
          name: 'Details',
          component: DetailsScreen,
          options: { title: 'Details' },
        }),
      ]);
      await tick();
      handleRef.value?.push('Details');
      await tick();
      expect(screenNodes()).toHaveLength(2);

      const nextState: INavigatorState = {
        routes: [{ key: 'reset-1', name: 'Details', params: { id: 7 } }],
      };
      handleRef.value?.reset(nextState);
      await tick();

      const screens = screenNodes();
      expect(screens).toHaveLength(1);
      expect(screens[0].props.activityState).toBe(2);
      expect(headerConfigOf(screens[0]).props.title).toBe('Details');
      expect(handleRef.value?.canGoBack()).toBe(false);
    });

    // why: headerSearchBarOptions must produce a real native RNSSearchBar, wrapped in the
    // RNSScreenStackHeaderSubview react-native-screens expects for a header accessory - not a bare
    // child, which native would refuse to lay out as a search bar.
    it('nests an RNSSearchBar child, wrapped in an RNSScreenStackHeaderSubview, when headerSearchBarOptions is set', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { initialRouteName: 'Home' }, () => [
              h(Stack.Screen, {
                name: 'Home',
                component: HomeScreen,
                options: { headerSearchBarOptions: { placeholder: 'Search' } },
              }),
            ]),
        }),
      );
      await tick();
      const header = headerConfigOf(screenNodes()[0]);
      expect(kidsOf(header)).toHaveLength(1);
      const subview = kidsOf(header)[0];
      expect(subview.viewName).toBe(HEADER_SUBVIEW_VIEW);
      expect(subview.props.type).toBe('searchBar');
      expect(kidsOf(subview)).toHaveLength(1);
      expect(kidsOf(subview)[0].viewName).toBe(SEARCH_BAR_VIEW);
      expect(kidsOf(subview)[0].props.placeholder).toBe('Search');
    });

    // why: a text change typed into the native search bar must reach the app's own onChangeText
    // callback - the one search bar event apps read on nearly every real usage.
    it('forwards search bar text changes to the app-supplied onChangeText callback', async () => {
      let receivedText: string | undefined;
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { initialRouteName: 'Home' }, () => [
              h(Stack.Screen, {
                name: 'Home',
                component: HomeScreen,
                options: {
                  headerSearchBarOptions: {
                    placeholder: 'Search',
                    onChangeText: (text: string) => {
                      receivedText = text;
                    },
                  },
                },
              }),
            ]),
        }),
      );
      await tick();
      const searchBar = searchBarNode();
      fabric.fireEvent(searchBar.instanceHandle, 'topChangeText', {
        text: 'asdf',
      });
      await tick();
      expect(receivedText).toBe('asdf');
    });

    // Остальные события search bar идут через общий `buildSearchBarPassthrough`, один кейс на все
    it('forwards every other native search bar event to its app-supplied callback', async () => {
      const received: {
        focus: number;
        blur: number;
        cancelButtonPress: number;
        close: number;
        open: number;
        searchButtonPressText?: string;
      } = { focus: 0, blur: 0, cancelButtonPress: 0, close: 0, open: 0 };
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { initialRouteName: 'Home' }, () => [
              h(Stack.Screen, {
                name: 'Home',
                component: HomeScreen,
                options: {
                  headerSearchBarOptions: {
                    placeholder: 'Search',
                    onFocus: () => received.focus++,
                    onBlur: () => received.blur++,
                    onCancelButtonPress: () => received.cancelButtonPress++,
                    onSearchButtonPress: (text: string) => {
                      received.searchButtonPressText = text;
                    },
                    onClose: () => received.close++,
                    onOpen: () => received.open++,
                  },
                },
              }),
            ]),
        }),
      );
      await tick();
      const searchBar = searchBarNode();
      fabric.fireEvent(searchBar.instanceHandle, 'topSearchFocus', {});
      fabric.fireEvent(searchBar.instanceHandle, 'topSearchBlur', {});
      fabric.fireEvent(searchBar.instanceHandle, 'topCancelButtonPress', {});
      fabric.fireEvent(searchBar.instanceHandle, 'topSearchButtonPress', {
        text: 'qwer',
      });
      fabric.fireEvent(searchBar.instanceHandle, 'topClose', {});
      fabric.fireEvent(searchBar.instanceHandle, 'topOpen', {});
      await tick();
      expect(received).toEqual({
        focus: 1,
        blur: 1,
        cancelButtonPress: 1,
        close: 1,
        open: 1,
        searchButtonPressText: 'qwer',
      });
    });

    // The app-supplied ref must send real native commands to the committed RNSSearchBar
    // Proves it resolves to the live host instance, not a stale or null one
    it('drives imperative SearchBarCommands (focus/setText/…) through the app-supplied ref', async () => {
      const searchBarRef = ref<ISearchBarCommands | null>(null);
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { initialRouteName: 'Home' }, () => [
              h(Stack.Screen, {
                name: 'Home',
                component: HomeScreen,
                options: {
                  headerSearchBarOptions: {
                    placeholder: 'Search',
                    ref: searchBarRef,
                  },
                },
              }),
            ]),
        }),
      );
      await tick();
      const searchBar = searchBarNode();

      searchBarRef.value?.focus();
      expect(fabric.commands.at(-1)).toMatchObject({
        commandName: 'focus',
        args: [],
      });
      // The node identity itself rather than a tag standing in for it — the command has to reach
      // THIS search bar, and the handle is what the engine actually named.
      expect(fabric.commands.at(-1)?.handle).toBe(searchBar.handle);

      searchBarRef.value?.setText('preset');
      expect(fabric.commands.at(-1)).toMatchObject({
        commandName: 'setText',
        args: ['preset'],
      });

      searchBarRef.value?.toggleCancelButton(false);
      expect(fabric.commands.at(-1)).toMatchObject({
        commandName: 'toggleCancelButton',
        args: [false],
      });

      searchBarRef.value?.clearText();
      expect(fabric.commands.at(-1)).toMatchObject({
        commandName: 'clearText',
        args: [],
      });

      searchBarRef.value?.cancelSearch();
      expect(fabric.commands.at(-1)).toMatchObject({
        commandName: 'cancelSearch',
        args: [],
      });

      searchBarRef.value?.blur();
      expect(fabric.commands.at(-1)).toMatchObject({
        commandName: 'blur',
        args: [],
      });
    });

    // Without `headerSearchBarOptions` the header config has zero children, no empty subview
    it('renders the header config with zero children when there is no search bar', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { initialRouteName: 'Home' }, () => [
              h(Stack.Screen, { name: 'Home', component: HomeScreen }),
            ]),
        }),
      );
      await tick();
      const header = headerConfigOf(screenNodes()[0]);
      expect(kidsOf(header)).toHaveLength(0);
    });

    // The route list is history, not a projection of the slot's markers
    // A pushed route whose marker left would be a phantom every back press walks through
    it('drops a pushed route whose <Stack.Screen> marker leaves the slot', async () => {
      const handleRef = ref<INavigatorHandle | null>(null);
      const isDetailsRegistered = ref(true);
      mountDynamicStack(handleRef, isDetailsRegistered);
      await tick();
      handleRef.value?.push('Details');
      await tick();
      expect(screenNodes()).toHaveLength(2);

      isDetailsRegistered.value = false;
      await tick();

      expect(screenNodes()).toHaveLength(1);
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home'),
      ).toBeDefined();
      expect(
        findInTree(
          n => n.viewName === 'RCTRawText' && n.props.text === 'details',
        ),
      ).toBeUndefined();
      expect(handleRef.value?.canGoBack()).toBe(false);
    });

    // why: the pruning must be PERSISTED, not just painted - a phantom left in the ref has the next
    // push rebuild the stack on top of it, and the user then has to press back TWICE to leave a
    // route they only visited once.
    it('keeps the pruned history when a new route is pushed afterwards', async () => {
      const handleRef = ref<INavigatorHandle | null>(null);
      const isDetailsRegistered = ref(true);
      mountDynamicStack(handleRef, isDetailsRegistered);
      await tick();
      handleRef.value?.push('Details');
      await tick();
      isDetailsRegistered.value = false;
      await tick();
      handleRef.value?.push('Profile');
      await tick();
      handleRef.value?.pop();
      await tick();

      expect(screenNodes()).toHaveLength(1);
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home'),
      ).toBeDefined();
      expect(handleRef.value?.canGoBack()).toBe(false);
    });
  });
});

describe('Vue Stack custom header views', () => {
  async function mountHome(options: IVueScreenOptions): Promise<void> {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Stack, { initialRouteName: 'Home' }, () => [
            h(Stack.Screen, { name: 'Home', component: HomeScreen, options }),
          ]),
      }),
    );
    await tick();
  }

  function subviewOfType(type: string): IAuthoredNode | undefined {
    return kidsOf(headerConfigOf(screenNodes()[0])).find(
      kid => kid.viewName === HEADER_SUBVIEW_VIEW && kid.props.type === type,
    );
  }

  it.each([
    ['headerLeft', 'left'],
    ['headerRight', 'right'],
    ['headerTitle', 'center'],
  ] as const)(
    'mounts the %s vnode inside a %s subview',
    async (option, type) => {
      await mountHome({ [option]: () => h('text', {}, 'custom') });

      const subview = subviewOfType(type);
      expect(subview).toBeDefined();
      const [content] = subview ? kidsOf(subview) : [];
      expect(content && kidsOf(content)[0]?.props.text).toBe('custom');
    },
  );

  it('sends the side priority and background options to the matching subview', async () => {
    await mountHome({
      headerRight: () => h('text', {}, 'more'),
      headerRightVisibilityPriority: 'low',
      headerRightBackgroundVisible: false,
    });

    expect(subviewOfType('right')?.props.visibilityPriority).toBe('low');
    expect(subviewOfType('right')?.props.hidesSharedBackground).toBe(true);
  });

  it('hosts the back image source in a back subview holding an image', async () => {
    await mountHome({
      headerBackImageSource: { uri: 'https://example.test/b.png' },
    });

    const subview = subviewOfType('back');
    expect(subview).toBeDefined();
    const [image] = subview ? kidsOf(subview) : [];
    expect(image?.viewName).toBe('RCTImageView');
  });

  it('keeps the search bar subview next to a custom one', async () => {
    await mountHome({
      headerLeft: () => h('text', {}, 'menu'),
      headerSearchBarOptions: { placeholder: 'Search' },
    });

    expect(subviewOfType('left')).toBeDefined();
    expect(subviewOfType('searchBar')).toBeDefined();
  });

  it('adds no subview when the app sets no custom view', async () => {
    await mountHome({ title: 'Home' });

    expect(kidsOf(headerConfigOf(screenNodes()[0]))).toHaveLength(0);
  });
});

describe('Vue Stack sheet footer', () => {
  async function mountHome(options: IVueScreenOptions): Promise<void> {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Stack, { initialRouteName: 'Home' }, () => [
            h(Stack.Screen, { name: 'Home', component: HomeScreen, options }),
          ]),
      }),
    );
    await tick();
  }

  const footerNode = () =>
    findInTree(node => node.viewName === SHEET_FOOTER_VIEW);
  const sheetFooter = () => h('text', {}, 'footer');

  it('mounts the footer content inside a native footer on a form sheet', async () => {
    await mountHome({ stackPresentation: 'formSheet', sheetFooter });

    const footer = footerNode();
    expect(footer).toBeDefined();
    const [content] = footer ? kidsOf(footer) : [];
    expect(content && kidsOf(content)[0]?.props.text).toBe('footer');
  });

  it('keeps the footer a real view, as native finds it by class', async () => {
    await mountHome({ stackPresentation: 'formSheet', sheetFooter });

    expect(footerNode()?.props.collapsable).toBe(false);
  });

  it('puts the footer in the inner screen that holds the header', async () => {
    await mountHome({ stackPresentation: 'formSheet', sheetFooter });

    const inner = screenNodes()[0];
    expect(kidsOf(inner).some(kid => kid.viewName === SHEET_FOOTER_VIEW)).toBe(
      true,
    );
  });

  it('puts the footer straight in the screen when the header is hidden', async () => {
    await mountHome({
      stackPresentation: 'formSheet',
      headerShown: false,
      sheetFooter,
    });

    const modal = findInTree(node => node.viewName === MODAL_SCREEN_VIEW);
    expect(
      modal && kidsOf(modal).some(kid => kid.viewName === SHEET_FOOTER_VIEW),
    ).toBe(true);
  });

  it.each(['push', 'modal', 'pageSheet'] as const)(
    'has no footer on a %s screen',
    async stackPresentation => {
      await mountHome({ stackPresentation, sheetFooter });

      expect(footerNode()).toBeUndefined();
    },
  );

  it('has no footer when the sheet sets none', async () => {
    await mountHome({ stackPresentation: 'formSheet' });

    expect(footerNode()).toBeUndefined();
  });
});
