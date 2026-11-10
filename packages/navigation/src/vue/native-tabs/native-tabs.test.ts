// Vue `NativeTab` against injected codegen-shaped ViewConfigs, headless runs as iOS
// Router and plan transitions are core's own tests, this file proves the lifecycle wiring into them

import { defineComponent, h, shallowRef } from '@vue/runtime-core';
import type { VNode } from '@vue/runtime-core';
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
} from '@symbiote-native/vue';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { NativeTab } from './index';
import type { INativeTabNavigatorHandle } from './index';
import { useIsFocused, useRoute } from '../composables';

const ROOT_TAG = 9_302;
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
    topTabSelectionPrevented: directEvent('onTabSelectionPrevented'),
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

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const hostNode = () => fabric.find(node => node.viewName === HOST_VIEW);
const screenNodes = () => fabric.findAll(node => node.viewName === SCREEN_VIEW);

const HomeScreen = defineComponent({
  setup: () => () => h('text', { testID: 'home' }),
});

const FeedScreen = defineComponent({
  setup: () => () => h('text', { testID: 'feed' }),
});

type IMountOptions = {
  // A getter runs in the parent render, so a ref read inside it re-renders the tabs
  props?: Record<string, unknown> | (() => Record<string, unknown>);
  slots?: Record<string, (args: { environment: string }) => VNode>;
};

async function mountTabs({ props = {}, slots = {} }: IMountOptions = {}) {
  const App = defineComponent({
    setup: () => () =>
      h(
        NativeTab,
        {
          initialRouteName: 'Home',
          ...(typeof props === 'function' ? props() : props),
        },
        {
          default: () => [
            h(NativeTab.Screen, {
              name: 'Home',
              component: HomeScreen,
              options: { title: 'Home', badgeValue: '2' },
            }),
            h(NativeTab.Screen, { name: 'Feed', component: FeedScreen }),
          ],
          ...slots,
        },
      ),
  });
  mount(ROOT_TAG, App);
  await tick();
}

describe('Vue NativeTab', () => {
  it('mounts the native host with one native screen per tab, every tab content inside', async () => {
    await mountTabs();

    expect(hostNode()).toBeDefined();
    expect(screenNodes()).toHaveLength(2);
    expect(fabric.find(node => node.props.testID === 'home')).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'feed')).toBeDefined();
  });

  it('asks native for the initial tab with no acknowledged provenance yet', async () => {
    await mountTabs({ props: { initialRouteName: 'Feed' } });

    const screenKeys = screenNodes().map(node => node.props.screenKey);
    expect(hostNode()?.props.navStateRequest).toEqual({
      selectedScreenKey: screenKeys[1],
      baseProvenance: 0,
    });
  });

  it('sends the screen options of a tab to its native screen', async () => {
    await mountTabs();

    expect(screenNodes()[0]?.props).toMatchObject({
      title: 'Home',
      badgeValue: '2',
    });
  });

  it('passes the host options of the app through', async () => {
    await mountTabs({ props: { tabBarHidden: true } });

    expect(hostNode()?.props.tabBarHidden).toBe(true);
  });

  it('applies a host option that changes after the first paint', async () => {
    const isHidden = shallowRef(false);
    await mountTabs({ props: () => ({ tabBarHidden: isHidden.value }) });
    expect(hostNode()?.props.tabBarHidden).not.toBe(true);

    isHidden.value = true;
    await tick();

    expect(hostNode()?.props.tabBarHidden).toBe(true);
  });

  it('applies a kebab-case host option that changes, as a template writes it', async () => {
    const isHidden = shallowRef(false);
    await mountTabs({ props: () => ({ 'tab-bar-hidden': isHidden.value }) });

    isHidden.value = true;
    await tick();

    expect(hostNode()?.props.tabBarHidden).toBe(true);
  });

  it('moves the request to another tab on jumpTo', async () => {
    const handle = shallowRef<INativeTabNavigatorHandle | null>(null);
    await mountTabs({ props: { ref: handle } });

    handle.value?.jumpTo('Feed');
    await tick();

    const screenKeys = screenNodes().map(node => node.props.screenKey);
    expect(hostNode()?.props.navStateRequest).toMatchObject({
      selectedScreenKey: screenKeys[1],
    });
  });

  it('follows the tab the user tapped, keeps the provenance and emits tabSelected', async () => {
    const onTabSelected = vi.fn();
    await mountTabs({ props: { onTabSelected } });
    const feedKey = screenNodes()[1]?.props.screenKey;

    fabric.fireEvent(hostNode()?.instanceHandle, 'topTabSelected', {
      selectedScreenKey: feedKey,
      provenance: 4,
      isRepeated: false,
      hasTriggeredSpecialEffect: false,
      actionOrigin: 'user',
    });
    await tick();

    expect(hostNode()?.props.navStateRequest).toEqual({
      selectedScreenKey: feedKey,
      baseProvenance: 4,
    });
    expect(onTabSelected).toHaveBeenCalledTimes(1);
  });

  it('gives each tab content its own route', async () => {
    const seen: string[] = [];
    const Probe = defineComponent({
      setup: () => {
        const route = useRoute();
        return () => {
          seen.push(route.value.name);
          return h('text', {});
        };
      },
    });
    const App = defineComponent({
      setup: () => () =>
        h(NativeTab, null, {
          default: () => [
            h(NativeTab.Screen, { name: 'A', component: Probe }),
            h(NativeTab.Screen, { name: 'B', component: Probe }),
          ],
        }),
    });
    mount(ROOT_TAG, App);
    await tick();

    expect(new Set(seen)).toEqual(new Set(['A', 'B']));
  });

  it('marks a tab focused when native shows it and blurred when native hides it', async () => {
    const focus: boolean[] = [];
    const Probe = defineComponent({
      setup: () => {
        const isFocused = useIsFocused();
        return () => {
          focus.push(isFocused.value);
          return h('text', {});
        };
      },
    });
    const App = defineComponent({
      setup: () => () =>
        h(NativeTab, null, {
          default: () => [h(NativeTab.Screen, { name: 'A', component: Probe })],
        }),
    });
    mount(ROOT_TAG, App);
    await tick();
    const screen = screenNodes()[0];

    fabric.fireEvent(screen?.instanceHandle, 'topDidAppear', {});
    await tick();
    expect(focus.at(-1)).toBe(true);

    fabric.fireEvent(screen?.instanceHandle, 'topDidDisappear', {});
    await tick();
    expect(focus.at(-1)).toBe(false);
  });
});

describe('Vue NativeTab bottom accessory', () => {
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

  it('renders the bottomAccessory slot once per environment on iOS 26', async () => {
    await mountTabs({
      slots: {
        bottomAccessory: ({ environment }) =>
          h('text', { testID: `accessory-${environment}` }),
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
