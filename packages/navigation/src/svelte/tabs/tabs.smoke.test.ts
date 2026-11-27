// Tab, driven through the real compiled `index.svelte` against a fake Fabric
// Tab is pure JS with no react-native-screens views, so this adds to the Stack smoke test

// The shared `renderTabBar` Descriptor is mounted through the bridge, not hand-copied
// It survives the item count going from 0 to N as the markers register

// Only the focused route is mounted, and `jumpTo` swaps it
// Focus and blur are synthesized, as the navigator has no native appear event

// Out of scope: the params merge of `jumpTo` and `setParams`, tested in core
// `core/tab-router-state/tab-router-state.test.ts`

// The prop to Descriptor mapping of `renderTabBar` has no core test, and is only wired here
// A core-level render-tabs test would cover its branches

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import type { ITabNavigatorHandle } from '../../core';
import {
  createNavigationLiveTree,
  type IFabricNode,
} from '../fabric-tree.test-helper';
import {
  createSvelteHarness,
  loadComponent,
} from '../svelte-compile.test-helper';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_702;
const fabric = installRecordingFabric();
const {
  appRoot,
  countLive,
  findAllLive,
  findLiveByTestId,
  outline,
  rawTextsOutsideTextContainer,
  walkLive,
} = createNavigationLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('tabs');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('tabs');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

// A navigator mounts a screen with no props, as route and navigation come from the context
// So each fixture sets its own `testID` and reports name, focus, params and key as a label
// The label fields are '|'-separated, as JSON params contain ':'
function screenSource(testID: string): string {
  return `<script lang="ts">
     import { useRoute } from '../runes/use-route.svelte';
     import { useIsFocused } from '../runes/use-is-focused.svelte';
     const route = useRoute();
     const focused = useIsFocused();
   </script>
   <view p={{ testID: '${testID}', accessibilityLabel: [route.current.name, String(focused.current), JSON.stringify(route.current.params ?? null), route.current.key].join('|') }} />`;
}

function appSource(tabAttributes: string): string {
  return `<script lang="ts">
     import Tab from './index.svelte';
     import TabScreen from '../tab-screen.svelte';
     import Feed from './feed-fixture.svelte';
     import Profile from './profile-fixture.svelte';
     let { onReady }: { onReady?: (handle: unknown) => void } = $props();
     let navigator = $state.raw<unknown>(null);
     $effect(() => { if (navigator !== null) onReady?.(navigator); });
   </script>
   <Tab bind:this={navigator} ${tabAttributes}>
     <TabScreen name="feed" component={Feed} options={{ tabBarLabel: 'Feed', tabBarBadge: 3 }} />
     <TabScreen name="profile" component={Profile} options={{ title: 'Profile' }} />
   </Tab>`;
}

// No `<Tab.Screen>` marker registered at all, the low boundary of the one item per screen rule
function emptyAppSource(): string {
  return `<script lang="ts">
     import Tab from './index.svelte';
     let { onReady }: { onReady?: (handle: unknown) => void } = $props();
     let navigator = $state.raw<unknown>(null);
     $effect(() => { if (navigator !== null) onReady?.(navigator); });
   </script>
   <Tab bind:this={navigator} />`;
}

// A live toggle around the "profile" marker, for the unregister half of the collector contract
// The fixtures above only ever register, and never remove
function toggleAppSource(): string {
  return `<script lang="ts">
     import Tab from './index.svelte';
     import TabScreen from '../tab-screen.svelte';
     import Feed from './feed-fixture.svelte';
     import Profile from './profile-fixture.svelte';
     let { onReady }: { onReady?: (handle: unknown) => void } = $props();
     let navigator = $state.raw<unknown>(null);
     let showProfile = $state(true);
     $effect(() => {
       if (navigator === null) return;
       onReady?.({ navigator, hideProfile: () => { showProfile = false; } });
     });
   </script>
   <Tab bind:this={navigator}>
     <TabScreen name="feed" component={Feed} options={{ tabBarLabel: 'Feed' }} />
     {#if showProfile}<TabScreen name="profile" component={Profile} options={{ title: 'Profile' }} />{/if}
   </Tab>`;
}

function isTabHandle(value: unknown): value is ITabNavigatorHandle {
  return typeof value === 'object' && value !== null && 'jumpTo' in value;
}

type IToggleHandle = {
  navigator: ITabNavigatorHandle;
  hideProfile: () => void;
};

function isToggleHandle(value: unknown): value is IToggleHandle {
  if (typeof value !== 'object' || value === null) return false;
  const hideProfile = Reflect.get(value, 'hideProfile');
  return (
    isTabHandle(Reflect.get(value, 'navigator')) &&
    typeof hideProfile === 'function'
  );
}

async function mountTab(
  variant = 'default',
  tabAttributes = '',
): Promise<ITabNavigatorHandle> {
  const dir = __dirname;
  harness.compileSource(dir, 'feed-fixture', screenSource('feed'));
  harness.compileSource(dir, 'profile-fixture', screenSource('profile'));
  const app = harness.compileSource(
    dir,
    `tab-app-${variant}`,
    appSource(tabAttributes),
  );
  const App = await loadComponent(app);
  let handle: unknown = null;
  mount(ROOT_TAG, App, {
    onReady: (value: unknown) => {
      handle = value;
    },
  });
  await tick();
  await tick();
  if (!isTabHandle(handle))
    throw new Error('Tab did not expose a navigator handle');
  return handle;
}

async function mountEmptyTab(): Promise<ITabNavigatorHandle> {
  const app = harness.compileSource(
    __dirname,
    'tab-app-empty',
    emptyAppSource(),
  );
  const App = await loadComponent(app);
  let handle: unknown = null;
  mount(ROOT_TAG, App, {
    onReady: (value: unknown) => {
      handle = value;
    },
  });
  await tick();
  await tick();
  if (!isTabHandle(handle))
    throw new Error('Tab did not expose a navigator handle');
  return handle;
}

async function mountToggleTab(): Promise<{
  navigator: ITabNavigatorHandle;
  hideProfile: () => void;
}> {
  const dir = __dirname;
  harness.compileSource(dir, 'feed-fixture', screenSource('feed'));
  harness.compileSource(dir, 'profile-fixture', screenSource('profile'));
  const app = harness.compileSource(dir, 'tab-app-toggle', toggleAppSource());
  const App = await loadComponent(app);
  let handle: unknown = null;
  mount(ROOT_TAG, App, {
    onReady: (value: unknown) => {
      handle = value;
    },
  });
  await tick();
  await tick();
  if (!isToggleHandle(handle)) {
    throw new Error('Tab did not expose the toggle-test handle shape');
  }
  return { navigator: handle.navigator, hideProfile: handle.hideProfile };
}

// The Tab root is the node with 3 children shaped [registry host (RCTText), content, bar]
// It is found by that shape, not by depth under `appRoot()`, to skip the registry host whitespace
function tabRootNode(): IFabricNode | undefined {
  let found: IFabricNode | undefined;
  walkLive(appRoot(), node => {
    if (found !== undefined) return;
    const kids = node.children;
    if (kids.length === 3 && kids[0]?.viewName === 'RCTText') found = node;
  });
  return found;
}
function tabBarNode(): IFabricNode | undefined {
  return tabRootNode()?.children[2];
}

function tabBarLabels(): string[] {
  const bar = tabBarNode();
  if (bar === undefined) return [];
  const labels: string[] = [];
  walkLive(bar.handle, node => {
    if (node.viewName === 'RCTRawText' && typeof node.props.text === 'string') {
      labels.push(node.props.text);
    }
  });
  return labels;
}

function isSelectionState(value: unknown): value is { selected?: boolean } {
  return typeof value === 'object' && value !== null;
}

// Every bar-item wrapper carries `accessibilityState` in registration order
// It is the one prop that tells which item is selected, without depending on paint position
function tabBarItemSelection(): boolean[] {
  const bar = tabBarNode();
  if (bar === undefined) return [];
  return findAllLive(bar.handle, 'RCTView')
    .filter(node => node.props.accessibilityState !== undefined)
    .map(node => {
      const state = node.props.accessibilityState;
      return isSelectionState(state) ? Boolean(state.selected) : false;
    });
}

function readScreenLabel(
  testID: string,
):
  { name: string; focused: boolean; params: unknown; key: string } | undefined {
  const label = findLiveByTestId(appRoot(), testID)?.props?.accessibilityLabel;
  if (typeof label !== 'string') return undefined;
  const [name, focused, paramsJson, key] = label.split('|');
  if (name === undefined || focused === undefined) return undefined;
  if (paramsJson === undefined || key === undefined) return undefined;
  return {
    name,
    focused: focused === 'true',
    params: JSON.parse(paramsJson),
    key,
  };
}

describe('Tab (real compiled index.svelte)', () => {
  describe('positive — mounts and renders without error', () => {
    // The `renderTabBar` Descriptor reaches the screen through the bridge every navigator uses
    // A hand-authored parallel markup would drift from what `renderTabBar` produces
    it('paints the shared tab bar with one item per registered screen', async () => {
      await mountTab();

      // The tree is root > [registry host, content, bar], with the bar built by `renderTabBar`
      // The root reads `#surface`, as it is created as an `RCTView` and then set to the surface
      // component, which Fabric commits as `RootView`
      expect(outline(appRoot()).slice(0, 6)).toEqual([
        '#surface',
        '  RCTView',
        '    RCTView',
        '      RCTText',
        '        RCTRawText',
        '      RCTView',
      ]);
    });

    // A label follows the react-navigation fallback: `tabBarLabel`, then `title`, then the name
    // A badge paints only when the screen supplied one
    it('resolves each item label through the tabBarLabel -> title -> name chain and renders a badge only where supplied', async () => {
      await mountTab();
      // Feed has the label 'Feed' and the badge '3'
      // Profile has no `tabBarLabel`, so it takes `options.title`, and it has no badge
      expect(tabBarLabels()).toEqual(['3', 'Feed', 'Profile']);
    });

    // The active tab is marked by `accessibilityState.selected`, as in react-navigation
    // Screen readers and tests find the current tab by it, not by paint order or color
    it('marks only the focused route as selected in the bar, in registration order', async () => {
      await mountTab();
      expect(tabBarItemSelection()).toEqual([true, false]);
    });

    // A tab navigator shows one screen at a time
    // The other route subtree and its state must not exist until that route is focused
    it('mounts only the focused route and swaps it on jumpTo', async () => {
      const handle = await mountTab();
      expect(findLiveByTestId(appRoot(), 'feed')).toBeDefined();
      expect(findLiveByTestId(appRoot(), 'profile')).toBeUndefined();

      handle.jumpTo('profile');
      await tick();
      await tick();
      expect(findLiveByTestId(appRoot(), 'feed')).toBeUndefined();
      expect(findLiveByTestId(appRoot(), 'profile')).toBeDefined();
    });

    // `initialRouteName` lands on a tab other than the first, as a deep link does
    it('honours initialRouteName', async () => {
      await mountTab('initial-route', 'initialRouteName="profile"');
      expect(findLiveByTestId(appRoot(), 'profile')).toBeDefined();
      expect(findLiveByTestId(appRoot(), 'feed')).toBeUndefined();
    });

    // A pure-JS tab bar has no native appear event, so focus and blur are synthesized in JS
    // That holds on mount, as a screen never navigated to is focused, and on each route change
    it('synthesizes focus on mount and moves it with the focused route', async () => {
      const handle = await mountTab();
      await tick();
      expect(readScreenLabel('feed')).toMatchObject({
        name: 'feed',
        focused: true,
        params: null,
      });

      handle.jumpTo('profile');
      await tick();
      await tick();
      await tick();
      expect(readScreenLabel('profile')).toMatchObject({
        name: 'profile',
        focused: true,
        params: null,
      });
    });

    // `setParams` reaches the target route without changing the focused one, as it is no navigation
    // The key is read off the mounted screen, as its format is an internal id
    it('propagates setParams to the target route without changing which route is focused', async () => {
      const handle = await mountTab();
      await tick();
      const feedKey = readScreenLabel('feed')?.key;
      if (feedKey === undefined)
        throw new Error('feed route key was not observed');

      handle.setParams({ sort: 'trending' }, feedKey);
      await tick();
      await tick();
      expect(readScreenLabel('feed')).toMatchObject({
        name: 'feed',
        focused: true,
        params: { sort: 'trending' },
      });
      expect(findLiveByTestId(appRoot(), 'profile')).toBeUndefined();
    });

    // An app can render `<Tab>` before any marker resolves, e.g. behind a data-driven `{#each}`
    // It must degrade to an empty bar and no content, and never throw
    it('renders an empty bar and no focused screen when no screens are registered', async () => {
      await mountEmptyTab();
      expect(findAllLive(appRoot(), 'RCTView').length).toBeGreaterThan(0);
      expect(tabBarLabels()).toEqual([]);
    });

    // A jump must not leak or drop the three fixed slots: the root, the content host and the bar
    it('keeps exactly one root, one content host and one bar after a jump', async () => {
      const handle = await mountTab();
      const before = countLive(appRoot(), 'RCTView');
      handle.jumpTo('profile');
      await tick();
      await tick();
      expect(countLive(appRoot(), 'RCTView')).toBe(before);
    });

    // Formatted templates make Svelte emit a ' ' text node between sibling tags
    // The renderer blanks it, as a real `RCTRawText` under a view would corrupt the paint order
    // It is re-checked after `jumpTo`, as each focus change rebuilds the screen subtree
    it('commits no raw text outside a text container', async () => {
      const handle = await mountTab('hygiene');
      expect(rawTextsOutsideTextContainer(appRoot())).toEqual([]);

      handle.jumpTo('profile');
      await tick();
      await tick();
      expect(rawTextsOutsideTextContainer(appRoot())).toEqual([]);
    });
  });

  // No negative group: this layer has no guard clause or throwing path of its own
  // An unknown route name in `jumpTo` or `setParams` is absorbed by `tabRouterReducer` in core
  // The registry-mismatch `dlog` in `screen-registry.ts` is silent and shared by all navigators

  describe('registry changes after mount', () => {
    // A `<Tab.Screen>` behind an `{#if}` gates a tab on a feature flag or a permission
    // The routes project the registry, so the tab must go with its marker, not linger as a raw name
    it('drops the tab of a screen unregistered after mount', async () => {
      const { hideProfile } = await mountToggleTab();
      expect(tabBarLabels()).toEqual(['Feed', 'Profile']);

      hideProfile();
      await tick();
      await tick();

      expect(tabBarLabels()).toEqual(['Feed']);
    });

    // Removing a different screen must not drop the current tab, as focus follows the route name
    // The params accumulated onto the surviving route must stay with it
    it('keeps the focused route and its params when an unrelated screen unregisters', async () => {
      const { navigator, hideProfile } = await mountToggleTab();
      await tick();
      const feedKey = readScreenLabel('feed')?.key;
      if (feedKey === undefined)
        throw new Error('feed route key was not observed');
      navigator.setParams({ sort: 'trending' }, feedKey);
      await tick();
      await tick();

      hideProfile();
      await tick();
      await tick();

      expect(readScreenLabel('feed')).toMatchObject({
        name: 'feed',
        focused: true,
        params: { sort: 'trending' },
        key: feedKey,
      });
    });

    // When the focused screen unregisters, no route is left to stay on
    // The fallback is the first remaining tab, as for an unresolvable `initialRouteName`
    it('falls back to the first remaining tab when the focused screen unregisters', async () => {
      const { navigator, hideProfile } = await mountToggleTab();
      navigator.jumpTo('profile');
      await tick();
      await tick();
      expect(findLiveByTestId(appRoot(), 'profile')).toBeDefined();

      hideProfile();
      await tick();
      await tick();

      expect(tabBarLabels()).toEqual(['Feed']);
      expect(findLiveByTestId(appRoot(), 'profile')).toBeUndefined();
      expect(readScreenLabel('feed')).toMatchObject({
        name: 'feed',
        focused: true,
      });
    });
  });
});
