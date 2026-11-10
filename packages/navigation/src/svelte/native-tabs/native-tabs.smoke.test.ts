// Svelte `NativeTab` through the compiled `index.svelte`, on injected codegen-shaped ViewConfigs
// Router and plan transitions are core's own tests, this file proves the lifecycle wiring into them

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import type { ITabNavigatorHandle } from '../../core';
import { createNavigationLiveTree } from '../fabric-tree.test-helper';
import {
  createSvelteHarness,
  loadComponent,
} from '../svelte-compile.test-helper';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_703;
const HOST_VIEW = 'RNSTabsHostIOS';
const SCREEN_VIEW = 'RNSTabsScreenIOS';
const ACCESSORY_VIEW = 'RNSTabsBottomAccessory';
const ACCESSORY_CONTENT_VIEW = 'RNSTabsBottomAccessoryContent';

function directEvent(registrationName: string): { registrationName: string } {
  return { registrationName };
}

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
  [ACCESSORY_VIEW]: { directEventTypes: {}, validAttributes: {} },
  [ACCESSORY_CONTENT_VIEW]: {
    directEventTypes: {},
    validAttributes: { environment: true },
  },
};

const fabric = installRecordingFabric();
const { appRoot, findAllLive, findLive, findLiveByTestId } =
  createNavigationLiveTree(fabric);
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('native-tabs');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('native-tabs');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

// The probe reports what its screen received through `accessibilityLabel`, the one channel a
// black-box mount has into it
const HOME_SOURCE = `<view p={{ testID: 'home' }} />`;
const FEED_SOURCE = `<view p={{ testID: 'feed' }} />`;
const PROBE_SOURCE = `<script lang="ts">
     import { useRoute } from '../runes/use-route.svelte';
     import { useIsFocused } from '../runes/use-is-focused.svelte';
     const route = useRoute();
     const focused = useIsFocused();
   </script>
   <view p={{ testID: 'probe-' + route.current.name, accessibilityLabel: String(focused.current) }} />`;

type IMountOptions = {
  attributes?: string;
  accessory?: string;
  screens?: string;
  // Extra script lines of the app, with `onFlip` to hand the test a way to change its state
  script?: string;
  onFlip?: (flip: () => void) => void;
};

const DEFAULT_SCREENS = `<NativeTabScreen name="Home" component={Home} options={{ title: 'Home', badgeValue: '2' }} />
     <NativeTabScreen name="Feed" component={Feed} />`;

function appSource({
  attributes = '',
  accessory = '',
  screens = DEFAULT_SCREENS,
  script = '',
}: IMountOptions): string {
  return `<script lang="ts">
     import NativeTab from './index.svelte';
     import NativeTabScreen from '../native-tab-screen.svelte';
     import Home from './home-fixture.svelte';
     import Feed from './feed-fixture.svelte';
     import Probe from './probe-fixture.svelte';
     let { onReady, onTabSelected, onFlip }: {
       onReady?: (handle: unknown) => void;
       onTabSelected?: (event: unknown) => void;
       onFlip?: (flip: () => void) => void;
     } = $props();
     let navigator = $state.raw<unknown>(null);
     $effect(() => { if (navigator !== null) onReady?.(navigator); });
     ${script}
   </script>
   ${accessory}
   <NativeTab bind:this={navigator} {onTabSelected} ${attributes}>
     ${screens}
   </NativeTab>`;
}

function isNavigatorHandle(value: unknown): value is ITabNavigatorHandle {
  return typeof value === 'object' && value !== null && 'jumpTo' in value;
}

let variantCounter = 0;

async function mountTabs(
  options: IMountOptions = {},
  onTabSelected?: (event: unknown) => void,
): Promise<ITabNavigatorHandle> {
  const dir = __dirname;
  harness.compileSource(dir, 'home-fixture', HOME_SOURCE);
  harness.compileSource(dir, 'feed-fixture', FEED_SOURCE);
  harness.compileSource(dir, 'probe-fixture', PROBE_SOURCE);
  variantCounter += 1;
  const app = harness.compileSource(
    dir,
    `native-tabs-app-${variantCounter}`,
    appSource(options),
  );
  const App = await loadComponent(app);
  let handle: unknown = null;
  mount(ROOT_TAG, App, {
    onReady: (value: unknown) => {
      handle = value;
    },
    onTabSelected,
    onFlip: options.onFlip,
  });
  await tick();
  await tick();
  if (!isNavigatorHandle(handle))
    throw new Error('NativeTab did not expose a navigator handle');
  return handle;
}

const hostNode = () => findLive(appRoot(), HOST_VIEW);
const screenNodes = () => findAllLive(appRoot(), SCREEN_VIEW);

describe('Svelte NativeTab', () => {
  it('mounts the native host with one native screen per tab, every tab content inside', async () => {
    await mountTabs();

    expect(hostNode()).toBeDefined();
    expect(screenNodes()).toHaveLength(2);
    expect(findLiveByTestId(appRoot(), 'home')).toBeDefined();
    expect(findLiveByTestId(appRoot(), 'feed')).toBeDefined();
  });

  it('asks native for the initial tab with no acknowledged provenance yet', async () => {
    await mountTabs({ attributes: 'initialRouteName="Feed"' });

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
    await mountTabs({ attributes: 'tabBarHidden' });

    expect(hostNode()?.props.tabBarHidden).toBe(true);
  });

  it('applies a host option that changes after the first paint', async () => {
    let hide: (() => void) | undefined;
    await mountTabs({
      script: `let isHidden = $state(false);
       $effect(() => { onFlip?.(() => { isHidden = true; }); });`,
      attributes: 'tabBarHidden={isHidden}',
      onFlip: flip => {
        hide = flip;
      },
    });
    expect(hostNode()?.props.tabBarHidden).not.toBe(true);

    hide?.();
    await tick();
    await tick();

    expect(hostNode()?.props.tabBarHidden).toBe(true);
  });

  it('moves the request to another tab on jumpTo', async () => {
    const handle = await mountTabs();

    handle.jumpTo('Feed');
    await tick();

    const screenKeys = screenNodes().map(node => node.props.screenKey);
    expect(hostNode()?.props.navStateRequest).toMatchObject({
      selectedScreenKey: screenKeys[1],
    });
  });

  it('follows the tab the user tapped, keeps the provenance and emits tabSelected', async () => {
    const onTabSelected = vi.fn();
    await mountTabs({}, onTabSelected);
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
    await mountTabs({
      screens: `<NativeTabScreen name="A" component={Probe} />
     <NativeTabScreen name="B" component={Probe} />`,
    });

    expect(findLiveByTestId(appRoot(), 'probe-A')).toBeDefined();
    expect(findLiveByTestId(appRoot(), 'probe-B')).toBeDefined();
  });

  it('marks a tab focused when native shows it and blurred when native hides it', async () => {
    await mountTabs({
      screens: `<NativeTabScreen name="A" component={Probe} />`,
    });
    const focusLabel = () =>
      findLiveByTestId(appRoot(), 'probe-A')?.props.accessibilityLabel;
    const screen = screenNodes()[0];
    expect(focusLabel()).toBe('false');

    fabric.fireEvent(screen?.instanceHandle, 'topDidAppear', {});
    await tick();
    expect(focusLabel()).toBe('true');

    fabric.fireEvent(screen?.instanceHandle, 'topDidDisappear', {});
    await tick();
    expect(focusLabel()).toBe('false');
  });
});

describe('Svelte NativeTab bottom accessory', () => {
  it('renders the bottomAccessory snippet once per environment on iOS 26', async () => {
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

    await mountTabs({
      accessory: `{#snippet bottomAccessory(environment: string)}<view p={{ testID: 'accessory-' + environment }} />{/snippet}`,
      attributes: '{bottomAccessory}',
    });

    expect(findLive(appRoot(), ACCESSORY_VIEW)).toBeDefined();
    expect(findAllLive(appRoot(), ACCESSORY_CONTENT_VIEW)).toHaveLength(2);
    expect(findLiveByTestId(appRoot(), 'accessory-regular')).toBeDefined();
    expect(findLiveByTestId(appRoot(), 'accessory-inline')).toBeDefined();
  });
});
