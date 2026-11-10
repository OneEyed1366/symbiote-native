// Angular `NativeTab` against injected codegen-shaped ViewConfigs, driven through `mount`
// Router and plan transitions are core's own tests, this file proves the lifecycle wiring into them

import '@angular/compiler';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ViewChild,
  signal,
  type Signal,
} from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  unmount,
  registerComposedComponent,
  setNativeViewConfigSource,
} from '@symbiote-native/angular';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { IAuthoredNode } from '@symbiote-native/test-utils';
import { childrenOf } from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { NativeTab } from './index';
import type { INativeTabNavigatorHandle } from './index';
import { NativeTabScreenDirective } from '../native-tab-screen.directive';
import { injectIsFocused } from '../injectors/inject-is-focused';
import { injectRoute } from '../injectors/inject-route';
import type { IRoute, INativeTabsViewHostOptions } from '../../core';

const ROOT_TAG = 5_122;
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
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
// Metro registers `NativeTab` as an anchor host at bundle time, vitest skips that step
registerComposedComponent('NativeTab');

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function appRoot(): ISymbioteNode {
  const root = fabric.find(node => node.props.pointerEvents === 'box-none');
  if (root === undefined) throw new Error('no AppContainer root was created');
  return root.handle;
}

// Walks the live child links, as a recording keeps every node it ever saw created
function findAllInTree(
  predicate: (node: IAuthoredNode) => boolean,
  handle: ISymbioteNode = appRoot(),
): IAuthoredNode[] {
  return childrenOf(handle).flatMap(child => {
    const recorded = fabric.find(one => one.handle === child);
    const own = recorded !== undefined && predicate(recorded) ? [recorded] : [];
    return [...own, ...findAllInTree(predicate, child)];
  });
}

const byView = (viewName: string) => (node: IAuthoredNode) =>
  node.viewName === viewName;
const hasText = (text: string) => (node: IAuthoredNode) =>
  node.viewName === 'RCTRawText' && node.props.text === text;

const hostNode = () => findAllInTree(byView(HOST_VIEW))[0];
const screenNodes = () => findAllInTree(byView(SCREEN_VIEW));

@Component({
  selector: 'home-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<text>home</text>`,
})
class HomeScreenComponent {}

@Component({
  selector: 'probe-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<text>{{ route().name }}:{{ isFocused() }}</text>`,
})
class ProbeScreenComponent {
  readonly route: Signal<IRoute<unknown>> = injectRoute();
  readonly isFocused: Signal<boolean> = injectIsFocused();
}

let capturedHost: NativeTabTestHost | undefined;
// The initial route is read once while the navigator mounts, so it is set before the mount
let pendingInitialRoute: string | undefined;

@Component({
  selector: 'native-tab-test-host',
  standalone: true,
  imports: [NativeTab, NativeTabScreenDirective],
  template: `
    <NativeTab
      #nav
      [initialRouteName]="initialRouteName"
      [host]="hostOptions()"
      [bottomAccessory]="withAccessory() ? accessory : undefined"
    >
      <ng-template
        symbioteNativeTabScreen
        name="Home"
        [component]="screenComponent"
        [options]="{ title: 'Home', badgeValue: '2' }"
      ></ng-template>
      <ng-template
        symbioteNativeTabScreen
        name="Feed"
        [component]="probeComponent"
      ></ng-template>
    </NativeTab>
    <ng-template #accessory let-environment>
      <text>accessory-{{ environment }}</text>
    </ng-template>
  `,
})
class NativeTabTestHost {
  @ViewChild('nav') nav!: NativeTab;

  readonly initialRouteName = pendingInitialRoute;
  readonly hostOptions = signal<Partial<INativeTabsViewHostOptions>>({});
  readonly withAccessory = signal(false);
  screenComponent = HomeScreenComponent;
  probeComponent = ProbeScreenComponent;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

async function mountTabs(
  setup: (host: NativeTabTestHost) => void = () => {},
  initialRouteName?: string,
): Promise<NativeTabTestHost> {
  capturedHost = undefined;
  pendingInitialRoute = initialRouteName;
  mount(ROOT_TAG, NativeTabTestHost);
  const host = capturedHost;
  if (!host) throw new Error('NativeTabTestHost never mounted');
  setup(host);
  await tick();
  await tick();
  return host;
}

describe('Angular NativeTab', () => {
  it('mounts the native host with one native screen per tab, every tab content inside', async () => {
    await mountTabs();

    expect(hostNode()).toBeDefined();
    expect(screenNodes()).toHaveLength(2);
    expect(findAllInTree(hasText('home'))).toHaveLength(1);
    expect(findAllInTree(hasText('Feed:false'))).toHaveLength(1);
  });

  it('asks native for the initial tab with no acknowledged provenance yet', async () => {
    await mountTabs(undefined, 'Feed');

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
    await mountTabs(host => host.hostOptions.set({ tabBarHidden: true }));

    expect(hostNode()?.props.tabBarHidden).toBe(true);
  });

  it('applies a host option that changes after the first paint', async () => {
    const host = await mountTabs();
    expect(hostNode()?.props.tabBarHidden).not.toBe(true);

    host.hostOptions.set({ tabBarHidden: true });
    await tick();
    await tick();

    expect(hostNode()?.props.tabBarHidden).toBe(true);
  });

  it('moves the request to another tab on jumpTo', async () => {
    const host = await mountTabs();
    const handle: INativeTabNavigatorHandle = host.nav;

    handle.jumpTo('Feed');
    await tick();

    const screenKeys = screenNodes().map(node => node.props.screenKey);
    expect(hostNode()?.props.navStateRequest).toMatchObject({
      selectedScreenKey: screenKeys[1],
    });
  });

  it('follows the tab the user tapped, keeps the provenance and emits tabSelected', async () => {
    const onTabSelected = vi.fn();
    await mountTabs(host => host.hostOptions.set({ onTabSelected }));
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

  it('marks a tab focused when native shows it and blurred when native hides it', async () => {
    await mountTabs();
    const feedScreen = screenNodes()[1];

    fabric.fireEvent(feedScreen?.instanceHandle, 'topDidAppear', {});
    await tick();
    expect(findAllInTree(hasText('Feed:true'))).toHaveLength(1);

    fabric.fireEvent(feedScreen?.instanceHandle, 'topDidDisappear', {});
    await tick();
    expect(findAllInTree(hasText('Feed:false'))).toHaveLength(1);
  });
});

describe('Angular NativeTab bottom accessory', () => {
  it('renders the bottomAccessory template once per environment on iOS 26', async () => {
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

    await mountTabs(host => host.withAccessory.set(true));

    expect(findAllInTree(byView(ACCESSORY_VIEW))).toHaveLength(1);
    expect(findAllInTree(byView(ACCESSORY_CONTENT_VIEW))).toHaveLength(2);
    expect(findAllInTree(hasText('accessory-regular'))).toHaveLength(1);
    expect(findAllInTree(hasText('accessory-inline'))).toHaveLength(1);
  });
});
