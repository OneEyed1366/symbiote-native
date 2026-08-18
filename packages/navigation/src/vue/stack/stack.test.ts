// Co-located Vue-driven pipeline test, the Vue twin of react/stack.test.tsx. Proves the shared
// core drives Vue correctly against an INJECTED codegen-shaped ViewConfig: push/pop mount and
// unmount RNSScreen children with the right activityState, the header title reaches
// RNSScreenStackHeaderConfig, and the native onDismissed/onHeaderBackButtonClicked events drive a
// pop through the imperative handle. Stack is imported from './index' (NOT the package barrel,
// '.') so the third-party native-spec side-effect (../register) never loads headless.
//
// Route-stack REDUCER logic (navigatorReducer's push/pop/reset transitions) is core's own
// responsibility and is covered by core's test suite - this file only proves Stack's OWN lifecycle
// wiring: that dispatching through the imperative handle / a native event actually reaches the
// reducer and that the result is bridged onto real RNSScreen/RNSScreenStackHeaderConfig props.
//
// No Negative group: Stack has no guard clause of its own that throws - "refuses to pop the last
// route" is a no-op the reducer already fails closed on (core's contract), observed here as an
// unchanged screen count, not a thrown error.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/vue';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from './index';
import type { INavigatorHandle } from './index';
import { useRoute } from '../composables';
import type { INavigatorState, ISearchBarCommands } from '../../core';

const ROOT_TAG = 4512;
const SCREEN_VIEW = 'RNSScreen';
const STACK_VIEW = 'RNSScreenStack';
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';
const HEADER_SUBVIEW_VIEW = 'RNSScreenStackHeaderSubview';
const SEARCH_BAR_VIEW = 'RNSSearchBar';

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
  validAttributes: {},
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
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findInTree(
  predicate: (node: IFakeNode) => boolean,
  nodes = fabric.committed,
): IFakeNode | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const child = findInTree(predicate, node.children);
    if (child) return child;
  }
  return undefined;
}

function screenNodes(): IFakeNode[] {
  const found: IFakeNode[] = [];
  const collect = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      if (node.viewName === SCREEN_VIEW) found.push(node);
      collect(node.children);
    }
  };
  collect(fabric.committed);
  return found;
}

function headerConfigOf(screen: IFakeNode): IFakeNode {
  const header = screen.children.find(
    child => child.viewName === HEADER_CONFIG_VIEW,
  );
  if (!header) throw new Error('no header config child on screen');
  return header;
}

function HomeScreen() {
  return h('symbiote-text', {}, 'home');
}

function DetailsScreen() {
  return h('symbiote-text', {}, 'details');
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
  return h('symbiote-text', {}, 'profile');
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
    // why: only the initial route mounts as a real RNSScreen, at the focused activityState (2), and
    // its header title reaches the native header config - the baseline every other case here builds on.
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

    // why: react-native-screens' native RNSScreen asserts an already-mounted NativeStack screen's
    // activityState can never decrease, and @react-navigation/native-stack's real algorithm never
    // demotes a route below the focused index to anything but 0 - both routes must stay
    // activityState 2 after a push, not just the new top.
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

    // why: an iOS interactive swipe-back dismiss is entirely native-driven - RNSScreen fires
    // onDismissed with no JS-side push/pop call at all, so Stack must treat that native event as
    // equivalent to an imperative pop(), not require the app to call pop() itself.
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
          return h('symbiote-text', {}, 'params');
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
          return h('symbiote-text', {}, 'params');
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
          return h('symbiote-text', {}, 'home');
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
      expect(header.children).toHaveLength(1);
      const subview = header.children[0];
      expect(subview.viewName).toBe(HEADER_SUBVIEW_VIEW);
      expect(subview.props.type).toBe('searchBar');
      expect(subview.children).toHaveLength(1);
      expect(subview.children[0].viewName).toBe(SEARCH_BAR_VIEW);
      expect(subview.children[0].props.placeholder).toBe('Search');
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
      const searchBar = headerConfigOf(screenNodes()[0]).children[0]
        .children[0];
      fabric.fireEvent(searchBar.instanceHandle, 'topChangeText', {
        text: 'asdf',
      });
      await tick();
      expect(receivedText).toBe('asdf');
    });

    // why: every other search bar lifecycle event (focus/blur/cancel/searchButtonPress/close/open)
    // must reach its own matching app-supplied callback - proven together since they share the same
    // buildSearchBarPassthrough wiring and a per-event regression would otherwise need its own file.
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
      const searchBar = headerConfigOf(screenNodes()[0]).children[0]
        .children[0];
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

    // why: the app-supplied search bar ref must drive REAL imperative native commands
    // (focus/setText/toggleCancelButton/clearText/cancelSearch/blur) on the committed RNSSearchBar
    // node, proving the ref callback resolves to the actual host instance rather than a stale or
    // null one.
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
      const searchBar = headerConfigOf(screenNodes()[0]).children[0]
        .children[0];

      searchBarRef.value?.focus();
      expect(fabric.commands.at(-1)).toMatchObject({
        commandName: 'focus',
        args: [],
      });
      expect(fabric.commands.at(-1)?.node.tag).toBe(searchBar.tag);

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

    // why: the boundary of the search-bar feature - when no headerSearchBarOptions is given, the
    // header config must render with ZERO children (not a placeholder/empty subview), so a screen
    // without a search bar pays no extra native cost.
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
      expect(header.children).toHaveLength(0);
    });

    // why: the route list is navigation HISTORY, not a projection of the slot's markers, so a
    // marker that leaves the slot while its route is still pushed used to leave a phantom entry -
    // a route nothing can render, which the user cannot see but every back press has to walk
    // through. Reconciling against the registry must drop it and leave the user on a real screen.
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
