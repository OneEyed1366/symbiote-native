// Tab, driven through the REAL compiled index.svelte against a fake Fabric. Tab is a pure-JS UI
// (no react-native-screens views), so what this proves on top of Stack's own smoke is:
//  - the shared `renderTabBar` Descriptor really is mounted through the bridge rather than
//    hand-copied, and survives the item count going 0 -> N as the markers register,
//  - only the FOCUSED route's screen is mounted, and jumpTo swaps it,
//  - focus/blur are synthesized correctly for a navigator with no native appear/disappear event.
//
// Out of scope here (already covered where the logic actually lives):
//  - jumpTo/setParams params-merge semantics (array vs object) -> tabRouterReducer's own
//    framework-free unit test (core/tab-router-state/tab-router-state.test.ts).
//  - renderTabBar's own prop->Descriptor mapping (icon/badge/tint-color resolution) is a pure
//    function with no dedicated core test of its own; this file only proves it is WIRED, not
//    every one of its branches - a gap worth a core-level render-tabs test, not this file's job.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import type { ITabNavigatorHandle } from '../../core';
import {
  countLive,
  findAllLive,
  findLiveByTestId,
  outline,
  walkLive,
} from '../fabric-tree.test-helper';
import { createSvelteHarness, loadComponent } from '../svelte-compile.test-helper';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_702;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('tabs');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('tabs');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

// A navigator mounts a registered screen with NO props of its own (route/navigation are read
// through the runes off the context), so each fixture hardcodes its own testID and reports
// route name + focus + params + key through accessibilityLabel, the only channel this
// black-box harness has into what the mounted screen actually received. '|'-separated because
// params serializes through JSON, which itself contains ':'.
function screenSource(testID: string): string {
  return `<script lang="ts">
     import { useRoute } from '../runes/use-route.svelte';
     import { useIsFocused } from '../runes/use-is-focused.svelte';
     const route = useRoute();
     const focused = useIsFocused();
   </script>
   <symbiote-view p={{ testID: '${testID}', accessibilityLabel: [route.current.name, String(focused.current), JSON.stringify(route.current.params ?? null), route.current.key].join('|') }} />`;
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

// No <Tab.Screen> markers registered at all - the boundary at the bottom of the registered-count
// range the "one item per screen" rule above has to hold for.
function emptyAppSource(): string {
  return `<script lang="ts">
     import Tab from './index.svelte';
     let { onReady }: { onReady?: (handle: unknown) => void } = $props();
     let navigator = $state.raw<unknown>(null);
     $effect(() => { if (navigator !== null) onReady?.(navigator); });
   </script>
   <Tab bind:this={navigator} />`;
}

// A live toggle around the "profile" marker, to exercise the unregister half of the
// register/unregister collector contract (setScreenCollector in tabs/index.svelte) - the
// registered-count fixtures above only ever register, never remove.
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

async function mountTab(variant = 'default', tabAttributes = ''): Promise<ITabNavigatorHandle> {
  const dir = __dirname;
  harness.compileSource(dir, 'feed-fixture', screenSource('feed'));
  harness.compileSource(dir, 'profile-fixture', screenSource('profile'));
  const app = harness.compileSource(dir, `tab-app-${variant}`, appSource(tabAttributes));
  const App = await loadComponent(app);
  let handle: unknown = null;
  mount(ROOT_TAG, App, {
    onReady: (value: unknown) => {
      handle = value;
    },
  });
  await tick();
  await tick();
  if (!isTabHandle(handle)) throw new Error('Tab did not expose a navigator handle');
  return handle;
}

async function mountEmptyTab(): Promise<ITabNavigatorHandle> {
  const app = harness.compileSource(__dirname, 'tab-app-empty', emptyAppSource());
  const App = await loadComponent(app);
  let handle: unknown = null;
  mount(ROOT_TAG, App, {
    onReady: (value: unknown) => {
      handle = value;
    },
  });
  await tick();
  await tick();
  if (!isTabHandle(handle)) throw new Error('Tab did not expose a navigator handle');
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
  if (
    handle === null ||
    typeof handle !== 'object' ||
    !('navigator' in handle) ||
    !('hideProfile' in handle) ||
    !isTabHandle(handle.navigator) ||
    typeof handle.hideProfile !== 'function'
  ) {
    throw new Error('Tab did not expose the toggle-test handle shape');
  }
  return { navigator: handle.navigator, hideProfile: handle.hideProfile };
}

// Tab's OWN root (not fabric.appRoot(), which is the outer mount wrapper a few levels up) is the
// node with exactly 3 children shaped [registry host (RCTText), content, bar] - the same shape
// the "paints the shared tab bar" outline test below asserts explicitly. Locating it structurally
// (rather than assuming a fixed depth under fabric.appRoot()) keeps these helpers from picking up
// the registry-host's own incidental whitespace text, which is not a tab-bar label at all.
type INode = { viewName?: string; props?: Record<string, unknown>; children?: INode[] };
function isNode(value: unknown): value is INode {
  return typeof value === 'object' && value !== null;
}
function tabRootNode(): INode | undefined {
  let found: INode | undefined;
  const search = (node: unknown): void => {
    if (found !== undefined || !isNode(node)) return;
    const children = node.children ?? [];
    if (children.length === 3 && children[0]?.viewName === 'RCTText') {
      found = node;
      return;
    }
    for (const child of children) search(child);
  };
  search(fabric.appRoot());
  return found;
}
function tabBarNode(): INode | undefined {
  return tabRootNode()?.children?.[2];
}

function tabBarLabels(): string[] {
  const labels: string[] = [];
  walkLive(tabBarNode(), node => {
    if (node.viewName === 'RCTRawText' && typeof node.props?.text === 'string') {
      labels.push(node.props.text);
    }
  });
  return labels;
}

function isSelectionState(value: unknown): value is { selected?: boolean } {
  return typeof value === 'object' && value !== null;
}

// Every bar-item wrapper carries `accessibilityState` (renderTabBar's passthrough), in
// registration order - the one prop that survives onto the live tree and lets a black-box test
// tell which item is "selected" without depending on paint position.
function tabBarItemSelection(): boolean[] {
  return findAllLive(tabBarNode(), 'RCTView')
    .filter(node => node.props?.accessibilityState !== undefined)
    .map(node => {
      const state = node.props?.accessibilityState;
      return isSelectionState(state) ? Boolean(state.selected) : false;
    });
}

function readScreenLabel(
  testID: string,
): { name: string; focused: boolean; params: unknown; key: string } | undefined {
  const label = findLiveByTestId(fabric.appRoot(), testID)?.props?.accessibilityLabel;
  if (typeof label !== 'string') return undefined;
  const [name, focused, paramsJson, key] = label.split('|');
  if (
    name === undefined ||
    focused === undefined ||
    paramsJson === undefined ||
    key === undefined
  ) {
    return undefined;
  }
  return { name, focused: focused === 'true', params: JSON.parse(paramsJson), key };
}

describe('Tab (real compiled index.svelte)', () => {
  describe('positive — mounts and renders without error', () => {
    // why: renderTabBar's Descriptor tree must reach the screen through the SAME bridge every
    // other navigator uses (createDescriptorSubtreeSync), not a hand-authored parallel markup
    // path - otherwise the bar would silently drift from what renderTabBar actually produces.
    it('paints the shared tab bar with one item per registered screen', async () => {
      await mountTab();

      // Root > [registry host, content, bar]; the bar's own subtree comes from the shared
      // renderTabBar Descriptor, mounted through the bridge rather than hand-authored markup.
      expect(outline(fabric.appRoot()).slice(0, 6)).toEqual([
        'RCTView',
        '  RCTView',
        '    RCTView',
        '      RCTText',
        '        RCTRawText',
        '      RCTView',
      ]);
    });

    // why: a route's tab-bar label follows react-navigation's own fallback chain -
    // tabBarLabel, then title, then the bare route name - and a badge only paints when the
    // screen actually supplied one (Feed has tabBarBadge: 3, Profile does not).
    it('resolves each item label through the tabBarLabel -> title -> name chain and renders a badge only where supplied', async () => {
      await mountTab();
      // Feed: tabBarLabel 'Feed' + badge '3'. Profile: no tabBarLabel, falls back to its
      // options.title 'Profile'; no badge supplied, so none renders.
      expect(tabBarLabels()).toEqual(['3', 'Feed', 'Profile']);
    });

    // why: react-navigation marks the active tab via accessibilityState.selected, which a
    // screen reader and any test harness rely on to identify the current tab without scraping
    // paint order or color.
    it('marks only the focused route as selected in the bar, in registration order', async () => {
      await mountTab();
      expect(tabBarItemSelection()).toEqual([true, false]);
    });

    // why: a tab navigator shows exactly one screen at a time - the other route's whole
    // subtree (and any state it holds) must not exist in the tree until it becomes focused.
    it('mounts only the focused route and swaps it on jumpTo', async () => {
      const handle = await mountTab();
      expect(findLiveByTestId(fabric.appRoot(), 'feed')).toBeDefined();
      expect(findLiveByTestId(fabric.appRoot(), 'profile')).toBeUndefined();

      handle.jumpTo('profile');
      await tick();
      await tick();
      expect(findLiveByTestId(fabric.appRoot(), 'feed')).toBeUndefined();
      expect(findLiveByTestId(fabric.appRoot(), 'profile')).toBeDefined();
    });

    // why: `initialRouteName` lets a consumer land on a tab other than the first registered
    // one - the common "deep link into the second tab" case.
    it('honours initialRouteName', async () => {
      await mountTab('initial-route', 'initialRouteName="profile"');
      expect(findLiveByTestId(fabric.appRoot(), 'profile')).toBeDefined();
      expect(findLiveByTestId(fabric.appRoot(), 'feed')).toBeUndefined();
    });

    // why: there is no native appear/disappear event for a pure-JS tab bar, so focus/blur must
    // be synthesized in JS - both on initial mount (a screen that is never "navigated to" must
    // still see itself as focused) and again when the focused route changes.
    it('synthesizes focus on mount and moves it with the focused route', async () => {
      const handle = await mountTab();
      await tick();
      expect(readScreenLabel('feed')).toMatchObject({ name: 'feed', focused: true, params: null });

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

    // why: setParams must reach the target route's params without touching which route is
    // focused - a param update is not a navigation. The route key is read off the mounted
    // screen itself rather than assumed, since the key format is an internal id this test has
    // no product reason to depend on.
    it('propagates setParams to the target route without changing which route is focused', async () => {
      const handle = await mountTab();
      await tick();
      const feedKey = readScreenLabel('feed')?.key;
      if (feedKey === undefined) throw new Error('feed route key was not observed');

      handle.setParams({ sort: 'trending' }, feedKey);
      await tick();
      await tick();
      expect(readScreenLabel('feed')).toMatchObject({
        name: 'feed',
        focused: true,
        params: { sort: 'trending' },
      });
      expect(findLiveByTestId(fabric.appRoot(), 'profile')).toBeUndefined();
    });

    // why: an app can render <Tab> before any <Tab.Screen> marker resolves (e.g. behind a
    // data-driven {#each}) - this must degrade to an empty bar and no content, never throw.
    it('renders an empty bar and no focused screen when no screens are registered', async () => {
      await mountEmptyTab();
      expect(findAllLive(fabric.appRoot(), 'RCTView').length).toBeGreaterThan(0);
      expect(tabBarLabels()).toEqual([]);
    });

    // why: jumping between tabs must not leak or drop structural wrappers - the root, the
    // content host and the bar are the three fixed slots every navigation must preserve.
    it('keeps exactly one root, one content host and one bar after a jump', async () => {
      const handle = await mountTab();
      const before = countLive(fabric.appRoot(), 'RCTView');
      handle.jumpTo('profile');
      await tick();
      await tick();
      expect(countLive(fabric.appRoot(), 'RCTView')).toBe(before);
    });

    // why: a compiled-away whitespace text node between two sibling markers becomes a real
    // RCTRawText in the committed tree, corrupting any paint-order assertion downstream - a
    // build-time contract every navigator template (not just Tab's own root) must hold.
    it('compiles every navigator template with no stray whitespace text nodes', () => {
      const audit = createSvelteHarness('tabs-audit');
      audit.compileFile(join(__dirname, 'index.svelte'));
      audit.compileFile(join(__dirname, '../tab-screen.svelte'));
      expect(audit.strayWhitespaceCount()).toBe(0);
      audit.cleanup();
    });
  });

  // No negative group: this composition layer has no guard clause or throwing path of its own -
  // an unknown route name reaching jumpTo/setParams is absorbed by tabRouterReducer (core,
  // tested there), and there is no permission/validation gate at the Svelte lifecycle layer.
  // The nearest thing to a rejection path is the registry-mismatch dlog in screen-registry.ts,
  // which is silent by design (not a throw) and shared by every navigator kind, not Tab-specific.

  describe('registry changes after mount', () => {
    // why: a <Tab.Screen> behind an {#if} is how react-navigation apps gate a tab on a feature
    // flag or a permission; the route list is a projection of the registry, so the tab has to
    // disappear with its marker rather than linger as an item labelled with the raw route name.
    it('drops the tab of a screen unregistered after mount', async () => {
      const { hideProfile } = await mountToggleTab();
      expect(tabBarLabels()).toEqual(['Feed', 'Profile']);

      hideProfile();
      await tick();
      await tick();

      expect(tabBarLabels()).toEqual(['Feed']);
    });

    // why: dropping the user's current tab because a DIFFERENT screen was removed would be a
    // worse bug than the stale item itself - focus follows the route NAME, and the params
    // jumpTo/setParams accumulated onto the surviving route must ride along with it.
    it('keeps the focused route and its params when an unrelated screen unregisters', async () => {
      const { navigator, hideProfile } = await mountToggleTab();
      await tick();
      const feedKey = readScreenLabel('feed')?.key;
      if (feedKey === undefined) throw new Error('feed route key was not observed');
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

    // why: when the FOCUSED screen is the one that unregisters there is no route left to stay
    // on, so the fallback has to be explicit - the first remaining tab, the same landing spot a
    // navigator with an unresolvable initialRouteName gets.
    it('falls back to the first remaining tab when the focused screen unregisters', async () => {
      const { navigator, hideProfile } = await mountToggleTab();
      navigator.jumpTo('profile');
      await tick();
      await tick();
      expect(findLiveByTestId(fabric.appRoot(), 'profile')).toBeDefined();

      hideProfile();
      await tick();
      await tick();

      expect(tabBarLabels()).toEqual(['Feed']);
      expect(findLiveByTestId(fabric.appRoot(), 'profile')).toBeUndefined();
      expect(readScreenLabel('feed')).toMatchObject({ name: 'feed', focused: true });
    });
  });
});
