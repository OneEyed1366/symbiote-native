// Drawer, driven through the REAL compiled index.svelte against a fake Fabric.
//
// One thing has to be substituted to run this at all: `drawer/index.svelte` imports `Animated`
// from `@symbiote-native/svelte`'s main barrel, and that barrel re-exports real `.svelte` sources
// which Vite's plain (svelte-plugin-free) test transform cannot parse. So the harness aliases
// that ONE specifier to a module generated below - which itself pulls in the REAL, freshly
// compiled `AnimatedView.svelte` from the adapter, not a stand-in. Everything the drawer uses
// beyond it (PanResponder, Dimensions, AnimatedValue, timing) already comes straight from
// @symbiote-native/engine, which needs no substitution.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join, relative, resolve } from 'node:path';
import { rmSync, writeFileSync } from 'node:fs';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import type { IDrawerNavigatorHandle } from '../../core';
import { findLiveByTestId, outline } from '../fabric-tree.test-helper';
import { createSvelteHarness, loadComponent } from '../svelte-compile.test-helper';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_703;
const ANIMATED_VIEW_SOURCE = resolve(
  __dirname,
  '../../../../../adapters/svelte/src/modules/animated/AnimatedView.svelte',
);
const ANIMATED_ALIAS = join(__dirname, '.smoke-compiled-drawer-animated-alias.mjs');

// rAF is not a Node global; the engine's `timing` (driven by every openDrawer/closeDrawer/
// toggleDrawer call and by a gesture release) reads it at .start() time. Same shim, same reason,
// as vue/drawer/drawer.test.ts.
let frameClock = 0;
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const pending = pendingFrames.get(id);
        if (pending !== undefined) {
          pendingFrames.delete(id);
          frameClock += 16;
          pending(frameClock);
        }
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve_ => setTimeout(resolve_, 0));

let harness = createSvelteHarness('drawer', { '@symbiote-native/svelte': ANIMATED_ALIAS });

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  pendingFrames.clear();
  nextFrameId = 1;
  installRequestAnimationFrame();
  harness = createSvelteHarness('drawer', { '@symbiote-native/svelte': ANIMATED_ALIAS });
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
  rmSync(ANIMATED_ALIAS, { force: true });
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

function screenSource(testID: string): string {
  return `<script lang="ts">
     import { useRoute } from '../runes/use-route.svelte';
     import { useIsFocused } from '../runes/use-is-focused.svelte';
     const route = useRoute();
     const focused = useIsFocused();
   </script>
   <symbiote-view {...{ testID: '${testID}', accessibilityLabel: route.current.name + ':' + String(focused.current) }} />`;
}

function appSource(drawerAttributes: string): string {
  return `<script lang="ts">
     import Drawer from './index.svelte';
     import DrawerScreen from '../drawer-screen.svelte';
     import Inbox from './inbox-fixture.svelte';
     import Settings from './settings-fixture.svelte';
     let { onReady }: { onReady?: (handle: unknown) => void } = $props();
     let navigator = $state.raw<unknown>(null);
     $effect(() => { if (navigator !== null) onReady?.(navigator); });
   </script>
   <Drawer bind:this={navigator} ${drawerAttributes}>
     {#snippet drawerContent(slot)}<symbiote-view {...{ testID: 'drawer-panel-content', accessibilityLabel: String(slot.state.routes.length) + ':' + String(slot.state.isOpen) + ':' + String(Object.keys(slot.descriptors).length) + ':' + String(typeof slot.navigation.openDrawer) }} />{/snippet}
     <DrawerScreen name="inbox" component={Inbox} />
     <DrawerScreen name="settings" component={Settings} options={{ drawerLabel: 'Settings' }} />
   </Drawer>`;
}

function isDrawerHandle(value: unknown): value is IDrawerNavigatorHandle {
  return typeof value === 'object' && value !== null && 'openDrawer' in value;
}

async function mountDrawer(
  variant = 'default',
  drawerAttributes = '',
): Promise<IDrawerNavigatorHandle> {
  const dir = __dirname;
  const animatedView = await harness.compileFile(ANIMATED_VIEW_SOURCE);
  writeFileSync(
    ANIMATED_ALIAS,
    `import AnimatedView from ${JSON.stringify(relative(dir, animatedView))};\n` +
      'export const Animated = { View: AnimatedView };\n',
  );
  await harness.compileSource(dir, 'inbox-fixture', screenSource('inbox'));
  await harness.compileSource(dir, 'settings-fixture', screenSource('settings'));
  const app = await harness.compileSource(
    dir,
    `drawer-app-${variant}`,
    appSource(drawerAttributes),
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
  if (!isDrawerHandle(handle)) throw new Error('Drawer did not expose a navigator handle');
  return handle;
}

describe('Drawer (real compiled index.svelte)', () => {
  it('paints the shared renderDrawer slots in front order', async () => {
    await mountDrawer();

    // front: content, overlay, panel - preceded by the collapsed registry host that absorbs the
    // whitespace between the two `<Drawer.Screen>` markers.
    expect(outline(fabric.appRoot())).toEqual([
      'RCTView',
      '  RCTView',
      '    RCTView',
      '      RCTText',
      '        RCTRawText',
      '      RCTView',
      '        RCTView',
      '      RCTView',
      '      RCTView',
      '        RCTView',
    ]);
    expect(findLiveByTestId(fabric.appRoot(), 'inbox')).toBeDefined();
    expect(findLiveByTestId(fabric.appRoot(), 'drawer-panel-content')).toBeDefined();
  });

  it('hands the drawerContent snippet the router state, descriptors and handle', async () => {
    await mountDrawer();
    // routes:isOpen:descriptorCount:typeof openDrawer
    expect(
      findLiveByTestId(fabric.appRoot(), 'drawer-panel-content')?.props?.accessibilityLabel,
    ).toBe('2:false:2:function');
  });

  it('reflects openDrawer/closeDrawer in the overlay and the snippet state', async () => {
    const handle = await mountDrawer();
    handle.openDrawer();
    await tick();
    await tick();
    expect(
      findLiveByTestId(fabric.appRoot(), 'drawer-panel-content')?.props?.accessibilityLabel,
    ).toBe('2:true:2:function');

    handle.closeDrawer();
    await tick();
    await tick();
    expect(
      findLiveByTestId(fabric.appRoot(), 'drawer-panel-content')?.props?.accessibilityLabel,
    ).toBe('2:false:2:function');
  });

  it('mounts only the focused route and swaps it on jumpTo', async () => {
    const handle = await mountDrawer();
    expect(findLiveByTestId(fabric.appRoot(), 'inbox')).toBeDefined();
    expect(findLiveByTestId(fabric.appRoot(), 'settings')).toBeUndefined();

    handle.jumpTo('settings');
    await tick();
    await tick();
    expect(findLiveByTestId(fabric.appRoot(), 'inbox')).toBeUndefined();
    expect(findLiveByTestId(fabric.appRoot(), 'settings')).toBeDefined();
  });

  it('synthesizes focus on mount and moves it with the focused route', async () => {
    const handle = await mountDrawer();
    await tick();
    expect(findLiveByTestId(fabric.appRoot(), 'inbox')?.props?.accessibilityLabel).toBe(
      'inbox:true',
    );

    handle.jumpTo('settings');
    await tick();
    await tick();
    await tick();
    expect(findLiveByTestId(fabric.appRoot(), 'settings')?.props?.accessibilityLabel).toBe(
      'settings:true',
    );
  });

  it('drops the overlay and reverses the slot order for a permanent drawer', async () => {
    await mountDrawer('permanent', 'drawerType="permanent"');

    // permanent + left: panel, content, and no overlay at all.
    expect(outline(fabric.appRoot())).toEqual([
      'RCTView',
      '  RCTView',
      '    RCTView',
      '      RCTText',
      '        RCTRawText',
      '      RCTView',
      '        RCTView',
      '      RCTView',
      '        RCTView',
    ]);
  });

  it('honours initialRouteName', async () => {
    await mountDrawer('initial-route', 'initialRouteName="settings"');
    expect(findLiveByTestId(fabric.appRoot(), 'settings')).toBeDefined();
    expect(findLiveByTestId(fabric.appRoot(), 'inbox')).toBeUndefined();
  });

  it('compiles every navigator template with no stray whitespace text nodes', async () => {
    const audit = createSvelteHarness('drawer-audit', {
      '@symbiote-native/svelte': ANIMATED_ALIAS,
    });
    await audit.compileFile(join(__dirname, 'index.svelte'));
    await audit.compileFile(join(__dirname, '../drawer-screen.svelte'));
    expect(audit.strayWhitespaceCount()).toBe(0);
    audit.cleanup();
  });
});
