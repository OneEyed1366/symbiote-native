// Tab, driven through the REAL compiled index.svelte against a fake Fabric. Tab is a pure-JS UI
// (no react-native-screens views), so what this proves on top of Stack's own smoke is:
//  - the shared `renderTabBar` Descriptor really is mounted through the bridge rather than
//    hand-copied, and survives the item count going 0 -> N as the markers register,
//  - only the FOCUSED route's screen is mounted, and jumpTo swaps it,
//  - focus/blur are synthesized correctly for a navigator with no native appear/disappear event.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import type { ITabNavigatorHandle } from '../../core';
import { countLive, findLiveByTestId, outline, walkLive } from '../fabric-tree.test-helper';
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
// through the runes off the context), so each fixture hardcodes its own testID.
function screenSource(testID: string): string {
  return `<script lang="ts">
     import { useRoute } from '../runes/use-route.svelte';
     import { useIsFocused } from '../runes/use-is-focused.svelte';
     const route = useRoute();
     const focused = useIsFocused();
   </script>
   <symbiote-view {...{ testID: '${testID}', accessibilityLabel: route.current.name + ':' + String(focused.current) }} />`;
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

function isTabHandle(value: unknown): value is ITabNavigatorHandle {
  return typeof value === 'object' && value !== null && 'jumpTo' in value;
}

async function mountTab(variant = 'default', tabAttributes = ''): Promise<ITabNavigatorHandle> {
  const dir = __dirname;
  await harness.compileSource(dir, 'feed-fixture', screenSource('feed'));
  await harness.compileSource(dir, 'profile-fixture', screenSource('profile'));
  const app = await harness.compileSource(dir, `tab-app-${variant}`, appSource(tabAttributes));
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

// Svelte's own mount bootstrap and block-boundary codegen create real, empty `RCTRawText`
// markers alongside real content — see fabric-tree.test-helper.ts's `outline()` for the same
// filter (svelte-adapter-custom-renderer skill).
function tabBarLabels(): string[] {
  const labels: string[] = [];
  walkLive(fabric.appRoot(), node => {
    if (
      node.viewName === 'RCTRawText' &&
      typeof node.props?.text === 'string' &&
      node.props.text !== ''
    ) {
      labels.push(node.props.text);
    }
  });
  return labels;
}

describe('Tab (real compiled index.svelte)', () => {
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
    expect(tabBarLabels()).toEqual([' ', '3', 'Feed', 'Profile']);
  });

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

  it('honours initialRouteName', async () => {
    await mountTab('initial-route', 'initialRouteName="profile"');
    expect(findLiveByTestId(fabric.appRoot(), 'profile')).toBeDefined();
    expect(findLiveByTestId(fabric.appRoot(), 'feed')).toBeUndefined();
  });

  it('synthesizes focus on mount and moves it with the focused route', async () => {
    const handle = await mountTab();
    await tick();
    expect(findLiveByTestId(fabric.appRoot(), 'feed')?.props?.accessibilityLabel).toBe('feed:true');

    handle.jumpTo('profile');
    await tick();
    await tick();
    await tick();
    expect(findLiveByTestId(fabric.appRoot(), 'profile')?.props?.accessibilityLabel).toBe(
      'profile:true',
    );
  });

  it('keeps exactly one root, one content host and one bar after a jump', async () => {
    const handle = await mountTab();
    const before = countLive(fabric.appRoot(), 'RCTView');
    handle.jumpTo('profile');
    await tick();
    await tick();
    expect(countLive(fabric.appRoot(), 'RCTView')).toBe(before);
  });

  it('compiles every navigator template with no stray whitespace text nodes', async () => {
    const audit = createSvelteHarness('tabs-audit');
    await audit.compileFile(join(__dirname, 'index.svelte'));
    await audit.compileFile(join(__dirname, '../tab-screen.svelte'));
    expect(audit.strayWhitespaceCount()).toBe(0);
    audit.cleanup();
  });
});
