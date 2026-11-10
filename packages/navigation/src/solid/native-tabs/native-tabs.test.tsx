// Solid `NativeTab` against injected codegen-shaped ViewConfigs, headless runs as iOS
// Router and plan transitions are core's own tests, this file proves the lifecycle wiring into them

import { createEffect, createSignal } from 'solid-js';
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
} from '@symbiote-native/solid';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { NativeTab } from './index';
import type { INativeTabNavigatorHandle } from './index';
import { createIsFocused, useRoute } from '../primitives';

const ROOT_TAG = 7_703;
const HOST_VIEW = 'RNSTabsHostIOS';
const SCREEN_VIEW = 'RNSTabsScreenIOS';
const ACCESSORY_VIEW = 'RNSTabsBottomAccessory';
const ACCESSORY_CONTENT_VIEW = 'RNSTabsBottomAccessoryContent';

function directEvent(registrationName: string) {
  return { registrationName };
}

const PLAIN_CONFIG: INativeViewConfig = {
  directEventTypes: {},
  validAttributes: { environment: true },
};

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [HOST_VIEW]: {
    directEventTypes: {
      topTabSelected: directEvent('onTabSelected'),
      topTabSelectionRejected: directEvent('onTabSelectionRejected'),
      topTabSelectionPrevented: directEvent('onTabSelectionPrevented'),
    },
    validAttributes: { navStateRequest: true, tabBarHidden: true },
  },
  [SCREEN_VIEW]: {
    directEventTypes: {
      topDidAppear: directEvent('onDidAppear'),
      topDidDisappear: directEvent('onDidDisappear'),
    },
    validAttributes: { screenKey: true, title: true, badgeValue: true },
  },
  [ACCESSORY_VIEW]: PLAIN_CONFIG,
  [ACCESSORY_CONTENT_VIEW]: PLAIN_CONFIG,
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const hostNode = () => fabric.find(node => node.viewName === HOST_VIEW);
const screenNodes = () => fabric.findAll(node => node.viewName === SCREEN_VIEW);

const HomeScreen = () => <text testID="home" />;
const FeedScreen = () => <text testID="feed" />;

describe('Solid NativeTab', () => {
  it('mounts the native host with one native screen per tab, every tab content inside', async () => {
    mount(ROOT_TAG, () => (
      <NativeTab initialRouteName="Home">
        <NativeTab.Screen name="Home" component={HomeScreen} />
        <NativeTab.Screen name="Feed" component={FeedScreen} />
      </NativeTab>
    ));
    await flush();

    expect(hostNode()).toBeDefined();
    expect(screenNodes()).toHaveLength(2);
    expect(fabric.find(node => node.props.testID === 'home')).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'feed')).toBeDefined();
  });

  it('asks native for the initial tab with no acknowledged provenance yet', async () => {
    mount(ROOT_TAG, () => (
      <NativeTab initialRouteName="Feed">
        <NativeTab.Screen name="Home" component={HomeScreen} />
        <NativeTab.Screen name="Feed" component={FeedScreen} />
      </NativeTab>
    ));
    await flush();

    const screenKeys = screenNodes().map(node => node.props.screenKey);
    expect(hostNode()?.props.navStateRequest).toEqual({
      selectedScreenKey: screenKeys[1],
      baseProvenance: 0,
    });
  });

  it('sends the screen options of a tab to its native screen', async () => {
    mount(ROOT_TAG, () => (
      <NativeTab>
        <NativeTab.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Home', badgeValue: '2' }}
        />
      </NativeTab>
    ));
    await flush();

    expect(screenNodes()[0]?.props).toMatchObject({
      title: 'Home',
      badgeValue: '2',
    });
  });

  it('passes the host options of the app through', async () => {
    mount(ROOT_TAG, () => (
      <NativeTab tabBarHidden>
        <NativeTab.Screen name="Home" component={HomeScreen} />
      </NativeTab>
    ));
    await flush();

    expect(hostNode()?.props.tabBarHidden).toBe(true);
  });

  it('applies a host option that changes after the first paint', async () => {
    const [isHidden, setHidden] = createSignal(false);
    mount(ROOT_TAG, () => (
      <NativeTab tabBarHidden={isHidden()}>
        <NativeTab.Screen name="Home" component={HomeScreen} />
      </NativeTab>
    ));
    await flush();
    expect(hostNode()?.props.tabBarHidden).not.toBe(true);

    setHidden(true);
    await flush();

    expect(hostNode()?.props.tabBarHidden).toBe(true);
  });

  it('moves the request to another tab on jumpTo', async () => {
    let handle: INativeTabNavigatorHandle | undefined;
    mount(ROOT_TAG, () => (
      <NativeTab
        initialRouteName="Home"
        ref={value => {
          handle = value;
        }}
      >
        <NativeTab.Screen name="Home" component={HomeScreen} />
        <NativeTab.Screen name="Feed" component={FeedScreen} />
      </NativeTab>
    ));
    await flush();

    handle?.jumpTo('Feed');
    await flush();

    const screenKeys = screenNodes().map(node => node.props.screenKey);
    expect(hostNode()?.props.navStateRequest).toMatchObject({
      selectedScreenKey: screenKeys[1],
    });
  });

  it('follows the tab the user tapped, keeps the provenance and emits tabSelected', async () => {
    const onTabSelected = vi.fn();
    mount(ROOT_TAG, () => (
      <NativeTab initialRouteName="Home" onTabSelected={onTabSelected}>
        <NativeTab.Screen name="Home" component={HomeScreen} />
        <NativeTab.Screen name="Feed" component={FeedScreen} />
      </NativeTab>
    ));
    await flush();
    const feedKey = screenNodes()[1]?.props.screenKey;

    fabric.fireEvent(hostNode()?.instanceHandle, 'topTabSelected', {
      selectedScreenKey: feedKey,
      provenance: 4,
      isRepeated: false,
      hasTriggeredSpecialEffect: false,
      actionOrigin: 'user',
    });
    await flush();

    expect(hostNode()?.props.navStateRequest).toEqual({
      selectedScreenKey: feedKey,
      baseProvenance: 4,
    });
    expect(onTabSelected).toHaveBeenCalledTimes(1);
  });

  it('gives each tab content its own route', async () => {
    const seen = new Set<string>();
    const Probe = () => {
      const route = useRoute();
      seen.add(route().name);
      return <text />;
    };
    mount(ROOT_TAG, () => (
      <NativeTab>
        <NativeTab.Screen name="A" component={Probe} />
        <NativeTab.Screen name="B" component={Probe} />
      </NativeTab>
    ));
    await flush();

    expect(seen).toEqual(new Set(['A', 'B']));
  });

  it('marks a tab focused when native shows it and blurred when native hides it', async () => {
    const focus: boolean[] = [];
    const Probe = () => {
      const isFocused = createIsFocused();
      createEffect(() => {
        focus.push(isFocused());
      });
      return <text />;
    };
    mount(ROOT_TAG, () => (
      <NativeTab>
        <NativeTab.Screen name="A" component={Probe} />
      </NativeTab>
    ));
    await flush();
    const screen = screenNodes()[0];

    fabric.fireEvent(screen?.instanceHandle, 'topDidAppear', {});
    await flush();
    expect(focus.at(-1)).toBe(true);

    fabric.fireEvent(screen?.instanceHandle, 'topDidDisappear', {});
    await flush();
    expect(focus.at(-1)).toBe(false);
  });
});

describe('Solid NativeTab bottom accessory', () => {
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

  it('renders the bottomAccessory function once per environment on iOS 26', async () => {
    mount(ROOT_TAG, () => (
      <NativeTab
        ios={{
          bottomAccessory: environment => (
            <text testID={`accessory-${environment}`} />
          ),
        }}
      >
        <NativeTab.Screen name="Home" component={HomeScreen} />
      </NativeTab>
    ));
    await flush();

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
