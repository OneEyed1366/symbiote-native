// React `Stack` against an injected codegen-shaped ViewConfig: push and pop mount `RNSScreen`
// children, native dismiss events drive a pop, the header title reaches the header config
// Imported from `./index`, not the package barrel, so `../register` never loads headless

// Reducer transitions are core's own tests, this file proves only the lifecycle wiring into them

// No Negative group: popping the last route is a no-op the reducer already fails closed on

import { act, createElement, createRef, useState } from 'react';
import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/react';
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
import { useRoute } from '../hooks';
import type { INavigatorState, ISearchBarCommands } from '../../core';
import type { IReactScreenOptions } from '../screen';

const ROOT_TAG = 512;
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
  validAttributes: {
    placeholder: true,
  },
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

function HomeScreen(): ReturnType<typeof createElement> {
  return createElement('text', {}, 'home');
}

function DetailsScreen(): ReturnType<typeof createElement> {
  return createElement('text', {}, 'details');
}

function ProfileScreen(): ReturnType<typeof createElement> {
  return createElement('text', {}, 'profile');
}

// Captured on render so a test can drop the Details marker mid-flight (the mount/unmount harness
// re-mounts from scratch, so a second `mount()` call cannot express "same Stack, fewer markers").
let setDetailsRegistered: ((isRegistered: boolean) => void) | undefined;

function DynamicStackHost({
  navRef,
}: {
  navRef: RefObject<INavigatorHandle | null>;
}): ReturnType<typeof createElement> {
  const [isDetailsRegistered, setRegistered] = useState(true);
  setDetailsRegistered = setRegistered;
  return createElement(
    Stack,
    { ref: navRef, initialRouteName: 'Home' },
    createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
    isDetailsRegistered
      ? createElement(Stack.Screen, {
          name: 'Details',
          component: DetailsScreen,
        })
      : null,
    createElement(Stack.Screen, { name: 'Profile', component: ProfileScreen }),
  );
}

describe('React Stack navigator', () => {
  describe('Positive', () => {
    // Baseline for the rest: only the initial route mounts, focused, with its header title
    it('mounts only the initial route as an RNSScreen, focused', () => {
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { initialRouteName: 'Home' },
          createElement(Stack.Screen, {
            name: 'Home',
            component: HomeScreen,
            options: { title: 'Home' },
          }),
          createElement(Stack.Screen, {
            name: 'Details',
            component: DetailsScreen,
          }),
        ),
      );
      const screens = screenNodes();
      expect(screens).toHaveLength(1);
      expect(screens[0].props.activityState).toBe(2);
      expect(fabric.find(n => n.viewName === STACK_VIEW)).toBeDefined();
      expect(headerConfigOf(screens[0]).props.title).toBe('Home');
    });

    it('paints the stack container with nativeContainerStyle.backgroundColor', () => {
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          {
            initialRouteName: 'Home',
            nativeContainerStyle: { backgroundColor: '#112233' },
          },
          createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
        ),
      );
      const stack = fabric.find(node => node.viewName === STACK_VIEW);
      expect(stack?.props.nativeContainerBackgroundColor).toBeDefined();
    });

    // Native asserts a mounted screen's `activityState` never decreases, so both routes stay at 2
    it('push() mounts a second RNSScreen and keeps the first at activityState 2', () => {
      const ref = createRef<INavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { ref, initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
          createElement(Stack.Screen, {
            name: 'Details',
            component: DetailsScreen,
            options: { title: 'Details' },
          }),
        ),
      );
      act(() => ref.current?.push('Details'));
      const screens = screenNodes();
      expect(screens).toHaveLength(2);
      expect(screens[0].props.activityState).toBe(2);
      expect(screens[1].props.activityState).toBe(2);
      expect(headerConfigOf(screens[1]).props.title).toBe('Details');
      expect(ref.current?.canGoBack()).toBe(true);
    });

    // why: pop() must unmount the top RNSScreen (an ordinary child unmount - no imperative native
    // command needed) back down to the previous route, and canGoBack() must reflect the new depth.
    it('pop() unmounts back down to the previous route', () => {
      const ref = createRef<INavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { ref, initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
          createElement(Stack.Screen, {
            name: 'Details',
            component: DetailsScreen,
          }),
        ),
      );
      act(() => ref.current?.push('Details'));
      expect(screenNodes()).toHaveLength(2);
      act(() => ref.current?.pop());
      expect(screenNodes()).toHaveLength(1);
      expect(ref.current?.canGoBack()).toBe(false);
    });

    // why: popping the last route must be a silent no-op (fail closed), not an empty stack -
    // matches core's own reducer contract, observed here as an unchanged screen count.
    it('refuses to pop the last route', () => {
      const ref = createRef<INavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { ref, initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
        ),
      );
      act(() => ref.current?.pop());
      expect(screenNodes()).toHaveLength(1);
    });

    // An iOS swipe-back fires `onDismissed` with no JS pop call, so `Stack` must pop on that event
    it('drives a pop from the native onDismissed event (iOS swipe/interactive dismiss)', () => {
      const ref = createRef<INavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { ref, initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
          createElement(Stack.Screen, {
            name: 'Details',
            component: DetailsScreen,
          }),
        ),
      );
      act(() => ref.current?.push('Details'));
      expect(screenNodes()).toHaveLength(2);
      const top = screenNodes()[1];
      act(() =>
        fabric.fireEvent(top.instanceHandle, 'topDismissed', {
          dismissCount: 1,
        }),
      );
      expect(screenNodes()).toHaveLength(1);
    });

    // why: tapping the native header back button is a second native-driven pop trigger, wired
    // separately from onDismissed (see stack.ts's screenPassthrough) - both must reach the same
    // dispatch({ type: 'pop' }).
    it('drives a pop from the native onHeaderBackButtonClicked event', () => {
      const ref = createRef<INavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { ref, initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
          createElement(Stack.Screen, {
            name: 'Details',
            component: DetailsScreen,
          }),
        ),
      );
      act(() => ref.current?.push('Details'));
      const top = screenNodes()[1];
      act(() =>
        fabric.fireEvent(top.instanceHandle, 'topHeaderBackButtonClicked', {}),
      );
      expect(screenNodes()).toHaveLength(1);
    });

    // why: Stack must mount the app's REGISTERED component as the RNSScreen's content, not a
    // placeholder - proves the registry lookup (collectRegistry) actually wires through to render.
    it('mounts the registered screen component as the RNSScreen content', () => {
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
        ),
      );
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home'),
      ).toBeDefined();
    });

    // why: params passed to push() must reach the pushed screen's own useRoute() - the same route
    // object Stack builds, not a re-derived or stale copy.
    it('exposes route.params to the screen component via useRoute() after navigation.push', () => {
      let receivedParams: unknown;
      function ParamsScreen(): ReturnType<typeof createElement> {
        receivedParams = useRoute().params;
        return createElement('text', {}, 'params');
      }
      const ref = createRef<INavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { ref, initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
          createElement(Stack.Screen, {
            name: 'Details',
            component: ParamsScreen,
          }),
        ),
      );
      act(() => ref.current?.push('Details', { id: 42 }));
      expect(receivedParams).toEqual({ id: 42 });
    });

    // why: setParams() must MERGE onto the focused route in place - the stack's shape (which routes
    // are mounted) must not change, only that one route's params.
    it('setParams() merges onto the focused route without changing the stack shape', () => {
      let receivedParams: unknown;
      function ParamsScreen(): ReturnType<typeof createElement> {
        receivedParams = useRoute().params;
        return createElement('text', {}, 'params');
      }
      const ref = createRef<INavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { ref, initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
          createElement(Stack.Screen, {
            name: 'Details',
            component: ParamsScreen,
          }),
        ),
      );
      act(() => ref.current?.push('Details', { id: 1 }));
      act(() => ref.current?.setParams({ id: 2 }));
      expect(receivedParams).toEqual({ id: 2 });
      expect(screenNodes()).toHaveLength(2);
    });

    // why: setParams(params, key) must target the NAMED route, not just whichever one is currently
    // focused - the mechanism a screen deep in the stack uses to update its own params from afar.
    it('setParams() targets a route by key when given, not just the focused one', () => {
      let homeKey: string | undefined;
      let homeParams: unknown;
      function HomeTrackingScreen(): ReturnType<typeof createElement> {
        const route = useRoute();
        homeKey = route.key;
        homeParams = route.params;
        return createElement('text', {}, 'home');
      }
      const ref = createRef<INavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { ref, initialRouteName: 'Home' },
          createElement(Stack.Screen, {
            name: 'Home',
            component: HomeTrackingScreen,
            initialParams: { tab: 'feed' },
          }),
          createElement(Stack.Screen, {
            name: 'Details',
            component: DetailsScreen,
          }),
        ),
      );
      act(() => ref.current?.push('Details'));
      if (homeKey === undefined)
        throw new Error('home route key was never captured');
      act(() => ref.current?.setParams({ tab: 'search' }, homeKey));
      expect(homeParams).toEqual({ tab: 'search' });
    });

    // why: reset() must replace the WHOLE stack atomically - a fresh route list, not a diff against
    // the old one, including a route the app never pushed through push()/replace().
    it('reset() replaces the whole stack with the given state', () => {
      const ref = createRef<INavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { ref, initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
          createElement(Stack.Screen, {
            name: 'Details',
            component: DetailsScreen,
            options: { title: 'Details' },
          }),
        ),
      );
      act(() => ref.current?.push('Details'));
      expect(screenNodes()).toHaveLength(2);

      const nextState: INavigatorState = {
        routes: [{ key: 'reset-1', name: 'Details', params: { id: 7 } }],
      };
      act(() => ref.current?.reset(nextState));

      const screens = screenNodes();
      expect(screens).toHaveLength(1);
      expect(screens[0].props.activityState).toBe(2);
      expect(headerConfigOf(screens[0]).props.title).toBe('Details');
      expect(ref.current?.canGoBack()).toBe(false);
    });

    // why: headerSearchBarOptions must produce a real native RNSSearchBar, wrapped in the
    // RNSScreenStackHeaderSubview react-native-screens expects for a header accessory - not a
    // bare child, which native would refuse to lay out as a search bar.
    it('nests an RNSSearchBar child, wrapped in an RNSScreenStackHeaderSubview, when headerSearchBarOptions is set', () => {
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { initialRouteName: 'Home' },
          createElement(Stack.Screen, {
            name: 'Home',
            component: HomeScreen,
            options: { headerSearchBarOptions: { placeholder: 'Search' } },
          }),
        ),
      );
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
    it('forwards search bar text changes to the app-supplied onChangeText callback', () => {
      let receivedText: string | undefined;
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { initialRouteName: 'Home' },
          createElement(Stack.Screen, {
            name: 'Home',
            component: HomeScreen,
            options: {
              headerSearchBarOptions: {
                placeholder: 'Search',
                onChangeText: text => {
                  receivedText = text;
                },
              },
            },
          }),
        ),
      );
      const searchBar = searchBarNode();
      act(() =>
        fabric.fireEvent(searchBar.instanceHandle, 'topChangeText', {
          text: 'asdf',
        }),
      );
      expect(receivedText).toBe('asdf');
    });

    // The other search bar events share one `buildSearchBarPassthrough` wiring, each must reach
    // its own app callback
    it('forwards every other native search bar event to its app-supplied callback', () => {
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
        createElement(
          Stack,
          { initialRouteName: 'Home' },
          createElement(Stack.Screen, {
            name: 'Home',
            component: HomeScreen,
            options: {
              headerSearchBarOptions: {
                placeholder: 'Search',
                onFocus: () => received.focus++,
                onBlur: () => received.blur++,
                onCancelButtonPress: () => received.cancelButtonPress++,
                onSearchButtonPress: text => {
                  received.searchButtonPressText = text;
                },
                onClose: () => received.close++,
                onOpen: () => received.open++,
              },
            },
          }),
        ),
      );
      const searchBar = searchBarNode();
      act(() =>
        fabric.fireEvent(searchBar.instanceHandle, 'topSearchFocus', {}),
      );
      act(() =>
        fabric.fireEvent(searchBar.instanceHandle, 'topSearchBlur', {}),
      );
      act(() =>
        fabric.fireEvent(searchBar.instanceHandle, 'topCancelButtonPress', {}),
      );
      act(() =>
        fabric.fireEvent(searchBar.instanceHandle, 'topSearchButtonPress', {
          text: 'qwer',
        }),
      );
      act(() => fabric.fireEvent(searchBar.instanceHandle, 'topClose', {}));
      act(() => fabric.fireEvent(searchBar.instanceHandle, 'topOpen', {}));
      expect(received).toEqual({
        focus: 1,
        blur: 1,
        cancelButtonPress: 1,
        close: 1,
        open: 1,
        searchButtonPressText: 'qwer',
      });
    });

    // The app ref must send real native commands to the committed `RNSSearchBar`, so the lazy
    // `buildSearchBarHandle` getter has to resolve the live host instance
    it('drives imperative SearchBarCommands (focus/setText/…) through the app-supplied ref', () => {
      const searchBarRef = createRef<ISearchBarCommands>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { initialRouteName: 'Home' },
          createElement(Stack.Screen, {
            name: 'Home',
            component: HomeScreen,
            options: {
              headerSearchBarOptions: {
                placeholder: 'Search',
                ref: searchBarRef,
              },
            },
          }),
        ),
      );
      const searchBar = searchBarNode();

      searchBarRef.current?.focus();
      expect(fabric.commands.at(-1)).toMatchObject({
        commandName: 'focus',
        args: [],
      });
      // The node identity itself rather than a tag standing in for it — the command has to reach
      // THIS search bar, and the handle is what the engine actually named.
      expect(fabric.commands.at(-1)?.handle).toBe(searchBar.handle);

      searchBarRef.current?.setText('preset');
      expect(fabric.commands.at(-1)).toMatchObject({
        commandName: 'setText',
        args: ['preset'],
      });

      searchBarRef.current?.toggleCancelButton(false);
      expect(fabric.commands.at(-1)).toMatchObject({
        commandName: 'toggleCancelButton',
        args: [false],
      });

      searchBarRef.current?.clearText();
      expect(fabric.commands.at(-1)).toMatchObject({
        commandName: 'clearText',
        args: [],
      });

      searchBarRef.current?.cancelSearch();
      expect(fabric.commands.at(-1)).toMatchObject({
        commandName: 'cancelSearch',
        args: [],
      });

      searchBarRef.current?.blur();
      expect(fabric.commands.at(-1)).toMatchObject({
        commandName: 'blur',
        args: [],
      });
    });

    // Without `headerSearchBarOptions` the header config has zero children, no empty subview
    it('renders the header config with zero children when there is no search bar', () => {
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
        ),
      );
      const header = headerConfigOf(screenNodes()[0]);
      expect(kidsOf(header)).toHaveLength(0);
    });

    // A marker that unmounts while its route is pushed must not leave a blank screen the user
    // cannot leave, reconciling against the registry drops that entry
    it('drops a pushed route whose <Stack.Screen> marker unregisters', () => {
      const ref = createRef<INavigatorHandle>();
      mount(ROOT_TAG, createElement(DynamicStackHost, { navRef: ref }));
      act(() => ref.current?.push('Details'));
      expect(screenNodes()).toHaveLength(2);

      act(() => setDetailsRegistered?.(false));

      expect(screenNodes()).toHaveLength(1);
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home'),
      ).toBeDefined();
      expect(
        findInTree(
          n => n.viewName === 'RCTRawText' && n.props.text === 'details',
        ),
      ).toBeUndefined();
      expect(ref.current?.canGoBack()).toBe(false);
    });

    // The pruning must reach the reducer state, else the next push rebuilds on the phantom and
    // back needs two presses
    it('keeps the pruned history when a new route is pushed afterwards', () => {
      const ref = createRef<INavigatorHandle>();
      mount(ROOT_TAG, createElement(DynamicStackHost, { navRef: ref }));
      act(() => ref.current?.push('Details'));
      act(() => setDetailsRegistered?.(false));
      act(() => ref.current?.push('Profile'));
      act(() => ref.current?.pop());

      expect(screenNodes()).toHaveLength(1);
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home'),
      ).toBeDefined();
      expect(ref.current?.canGoBack()).toBe(false);
    });
  });
});

describe('React Stack custom header views', () => {
  function mountHome(options: IReactScreenOptions): void {
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { initialRouteName: 'Home' },
        createElement(Stack.Screen, {
          name: 'Home',
          component: HomeScreen,
          options,
        }),
      ),
    );
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
  ] as const)('mounts the %s element inside a %s subview', (option, type) => {
    mountHome({ [option]: () => createElement('text', {}, 'custom') });

    const subview = subviewOfType(type);
    expect(subview).toBeDefined();
    const [content] = subview ? kidsOf(subview) : [];
    expect(content && kidsOf(content)[0]?.props.text).toBe('custom');
  });

  it('sends the side priority and background options to the matching subview', () => {
    mountHome({
      headerRight: () => createElement('text', {}, 'more'),
      headerRightVisibilityPriority: 'low',
      headerRightBackgroundVisible: false,
    });

    expect(subviewOfType('right')?.props.visibilityPriority).toBe('low');
    expect(subviewOfType('right')?.props.hidesSharedBackground).toBe(true);
  });

  it('hosts the back image source in a back subview holding an image', () => {
    mountHome({ headerBackImageSource: { uri: 'https://example.test/b.png' } });

    const subview = subviewOfType('back');
    expect(subview).toBeDefined();
    const [image] = subview ? kidsOf(subview) : [];
    expect(image?.viewName).toBe('RCTImageView');
  });

  it('keeps the search bar subview next to a custom one', () => {
    mountHome({
      headerLeft: () => createElement('text', {}, 'menu'),
      headerSearchBarOptions: { placeholder: 'Search' },
    });

    expect(subviewOfType('left')).toBeDefined();
    expect(subviewOfType('searchBar')).toBeDefined();
  });

  it('adds no subview when the app sets no custom view', () => {
    mountHome({ title: 'Home' });

    expect(kidsOf(headerConfigOf(screenNodes()[0]))).toHaveLength(0);
  });
});

describe('React Stack sheet footer', () => {
  function mountHome(options: IReactScreenOptions): void {
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { initialRouteName: 'Home' },
        createElement(Stack.Screen, {
          name: 'Home',
          component: HomeScreen,
          options,
        }),
      ),
    );
  }

  const footerNode = () =>
    findInTree(node => node.viewName === SHEET_FOOTER_VIEW);
  const sheetFooter = () => createElement('text', {}, 'footer');

  it('mounts the footer content inside a native footer on a form sheet', () => {
    mountHome({ stackPresentation: 'formSheet', sheetFooter });

    const footer = footerNode();
    expect(footer).toBeDefined();
    const [content] = footer ? kidsOf(footer) : [];
    expect(content && kidsOf(content)[0]?.props.text).toBe('footer');
  });

  it('keeps the footer a real view, as native finds it by class', () => {
    mountHome({ stackPresentation: 'formSheet', sheetFooter });

    expect(footerNode()?.props.collapsable).toBe(false);
  });

  it('puts the footer in the inner screen that holds the header', () => {
    mountHome({ stackPresentation: 'formSheet', sheetFooter });

    const inner = screenNodes()[0];
    expect(kidsOf(inner).some(kid => kid.viewName === SHEET_FOOTER_VIEW)).toBe(
      true,
    );
  });

  it('puts the footer straight in the screen when the header is hidden', () => {
    mountHome({
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
    stackPresentation => {
      mountHome({ stackPresentation, sheetFooter });

      expect(footerNode()).toBeUndefined();
    },
  );

  it('has no footer when the sheet sets none', () => {
    mountHome({ stackPresentation: 'formSheet' });

    expect(footerNode()).toBeUndefined();
  });
});
