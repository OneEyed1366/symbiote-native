// React `NativeTab` against injected codegen-shaped ViewConfigs, headless runs as iOS
// Router and plan transitions are core's own tests, this file proves the lifecycle wiring into them

import { act, createElement, createRef } from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/react';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { NativeTab } from './index';
import type { INativeTabNavigatorHandle } from './index';
import { useIsFocused, useRoute } from '../hooks';

const ROOT_TAG = 9_301;
const HOST_VIEW = 'RNSTabsHostIOS';
const SCREEN_VIEW = 'RNSTabsScreenIOS';
const ACCESSORY_VIEW = 'RNSTabsBottomAccessory';
const ACCESSORY_CONTENT_VIEW = 'RNSTabsBottomAccessoryContent';

function directEvent(registrationName: string) {
  return { registrationName };
}

const HOST_CONFIG: INativeViewConfig = {
  directEventTypes: {
    topTabSelected: directEvent('onTabSelected'),
    topTabSelectionRejected: directEvent('onTabSelectionRejected'),
  },
  validAttributes: { navStateRequest: true, tabBarHidden: true },
};

const SCREEN_CONFIG: INativeViewConfig = {
  directEventTypes: {
    topDidAppear: directEvent('onDidAppear'),
    topDidDisappear: directEvent('onDidDisappear'),
  },
  validAttributes: { screenKey: true, title: true, badgeValue: true },
};

const PLAIN_CONFIG: INativeViewConfig = {
  directEventTypes: {},
  validAttributes: { environment: true },
};

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [HOST_VIEW]: HOST_CONFIG,
  [SCREEN_VIEW]: SCREEN_CONFIG,
  [ACCESSORY_VIEW]: PLAIN_CONFIG,
  [ACCESSORY_CONTENT_VIEW]: PLAIN_CONFIG,
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const hostNode = () => fabric.find(node => node.viewName === HOST_VIEW);
const screenNodes = () => fabric.findAll(node => node.viewName === SCREEN_VIEW);

function HomeScreen() {
  return createElement('text', { testID: 'home' });
}

function FeedScreen() {
  return createElement('text', { testID: 'feed' });
}

function mountTabs(props: Record<string, unknown> = {}) {
  act(() => {
    mount(
      ROOT_TAG,
      createElement(
        NativeTab,
        { initialRouteName: 'Home', ...props },
        createElement(NativeTab.Screen, {
          name: 'Home',
          component: HomeScreen,
          options: { title: 'Home', badgeValue: '2' },
        }),
        createElement(NativeTab.Screen, {
          name: 'Feed',
          component: FeedScreen,
        }),
      ),
    );
  });
}

describe('React NativeTab', () => {
  it('mounts the native host with one native screen per tab, every tab content inside', () => {
    mountTabs();

    expect(hostNode()).toBeDefined();
    expect(screenNodes()).toHaveLength(2);
    expect(fabric.find(node => node.props.testID === 'home')).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'feed')).toBeDefined();
  });

  it('asks native for the initial tab with no acknowledged provenance yet', () => {
    mountTabs({ initialRouteName: 'Feed' });

    const screenKeys = screenNodes().map(node => node.props.screenKey);
    expect(hostNode()?.props.navStateRequest).toEqual({
      selectedScreenKey: screenKeys[1],
      baseProvenance: 0,
    });
  });

  it('sends the screen options of a tab to its native screen', () => {
    mountTabs();

    expect(screenNodes()[0]?.props).toMatchObject({
      title: 'Home',
      badgeValue: '2',
    });
  });

  it('moves the request to another tab on jumpTo', () => {
    const ref = createRef<INativeTabNavigatorHandle>();
    mountTabs({ ref });

    act(() => ref.current?.jumpTo('Feed'));

    const screenKeys = screenNodes().map(node => node.props.screenKey);
    expect(hostNode()?.props.navStateRequest).toMatchObject({
      selectedScreenKey: screenKeys[1],
    });
  });

  it('follows the tab the user tapped and keeps the provenance native reported', () => {
    const onTabSelected = vi.fn();
    mountTabs({ onTabSelected });
    const feedKey = screenNodes()[1]?.props.screenKey;

    act(() =>
      fabric.fireEvent(hostNode()?.instanceHandle, 'topTabSelected', {
        selectedScreenKey: feedKey,
        provenance: 4,
        isRepeated: false,
        hasTriggeredSpecialEffect: false,
        actionOrigin: 'user',
      }),
    );

    expect(hostNode()?.props.navStateRequest).toEqual({
      selectedScreenKey: feedKey,
      baseProvenance: 4,
    });
    expect(onTabSelected).toHaveBeenCalledTimes(1);
  });

  it('gives each tab content its own route', () => {
    const seen: string[] = [];
    function Probe() {
      seen.push(useRoute().name);
      return createElement('text', {});
    }
    act(() => {
      mount(
        ROOT_TAG,
        createElement(
          NativeTab,
          {},
          createElement(NativeTab.Screen, { name: 'A', component: Probe }),
          createElement(NativeTab.Screen, { name: 'B', component: Probe }),
        ),
      );
    });

    expect(new Set(seen)).toEqual(new Set(['A', 'B']));
  });

  it('marks a tab focused when native shows it and blurred when native hides it', () => {
    const focus: boolean[] = [];
    function Probe() {
      focus.push(useIsFocused());
      return createElement('text', {});
    }
    act(() => {
      mount(
        ROOT_TAG,
        createElement(
          NativeTab,
          {},
          createElement(NativeTab.Screen, { name: 'A', component: Probe }),
        ),
      );
    });
    const screen = screenNodes()[0];

    act(() => fabric.fireEvent(screen?.instanceHandle, 'topDidAppear', {}));
    expect(focus.at(-1)).toBe(true);

    act(() => fabric.fireEvent(screen?.instanceHandle, 'topDidDisappear', {}));
    expect(focus.at(-1)).toBe(false);
  });
});

describe('React NativeTab bottom accessory', () => {
  beforeAll(() => {
    const constants = {
      getConstants: () => ({
        forceTouchAvailable: false,
        interfaceIdiom: 'phone',
        isTesting: false,
        osVersion: '26.0',
        systemName: 'iOS',
        reactNativeVersion: { major: 0, minor: 0, patch: 0, prerelease: null },
      }),
    };
    Object.assign(globalThis, {
      __turboModuleProxy: (name: string) =>
        name === 'PlatformConstants' ? constants : null,
      nativeModuleProxy: { PlatformConstants: constants },
    });
  });

  it('renders the app accessory once per environment on iOS 26', () => {
    mountTabs({
      ios: {
        bottomAccessory: (environment: string) =>
          createElement('text', { testID: `accessory-${environment}` }),
      },
    });

    expect(fabric.find(node => node.viewName === ACCESSORY_VIEW)).toBeDefined();
    expect(
      fabric.findAll(node => node.viewName === ACCESSORY_CONTENT_VIEW),
    ).toHaveLength(2);
    expect(
      fabric.find(node => node.props.testID === 'accessory-regular'),
    ).toBeDefined();
    expect(
      fabric.find(node => node.props.testID === 'accessory-inline'),
    ).toBeDefined();
  });
});
