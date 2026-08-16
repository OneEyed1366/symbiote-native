// The runes bucket, exercised inside a REAL Stack-mounted screen. Runes cannot be called from a
// plain test function - `$state`/`$effect` need Svelte's module compiler and a live component
// context, so every assertion here rides a compiled probe component that reports through a
// callback prop (the same shape splash-screen's own rune test uses).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
import type { INativeViewConfig } from '@symbiote-native/engine';
import type { INavigatorHandle } from '../../core';
import { findLive, findLiveByTestId } from '../fabric-tree.test-helper';
import { createSvelteHarness, loadComponent } from '../svelte-compile.test-helper';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_704;

function directEvent(registrationName: string): { registrationName: string } {
  return { registrationName };
}

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  RNSScreen: {
    directEventTypes: {
      topAppear: directEvent('onAppear'),
      topDisappear: directEvent('onDisappear'),
      topDismissed: directEvent('onDismissed'),
    },
    validAttributes: { screenId: true, activityState: true },
  },
  RNSScreenStack: { directEventTypes: {}, validAttributes: {} },
  RNSScreenStackHeaderConfig: { directEventTypes: {}, validAttributes: { title: true } },
  RNSScreenContentWrapper: { directEventTypes: {}, validAttributes: { collapsable: true } },
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('runes');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('runes');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

// Everything a screen can read, folded into one accessibilityLabel so a single live-tree read
// asserts the whole surface at once.
const PROBE_SOURCE = `<script lang="ts">
   import { useNavigation } from './use-navigation.svelte';
   import { useStackNavigation } from './use-stack-navigation.svelte';
   import { useNavigationState } from './use-navigation-state.svelte';
   import { useFocusEffect } from './use-focus-effect.svelte';
   import { useRoute } from './use-route.svelte';
   const navigation = useNavigation();
   const stackNavigation = useStackNavigation();
   const route = useRoute();
   const routeCount = useNavigationState(state => state.routes.length);
   let focusRuns = $state(0);
   let cleanupRuns = $state(0);
   useFocusEffect(() => {
     focusRuns += 1;
     return () => { cleanupRuns += 1; };
   });
   const label = $derived([
     route.current.name + ':' + String(route.current.params ?? 'none'),
     String(routeCount.current),
     String(focusRuns),
     String(cleanupRuns),
     typeof stackNavigation.current.push,
     typeof navigation.current.addListener,
     String(navigation.current.getParent() === undefined),
   ].join('|'));
 </script>
 <symbiote-view testID="probe" accessibilityLabel={label} />`;

const MISMATCH_PROBE_SOURCE = `<script lang="ts">
   import { useTabNavigation } from './use-tab-navigation.svelte';
   const tabNavigation = useTabNavigation();
   let message = $state('no error');
   $effect(() => {
     try {
       void tabNavigation.current;
     } catch (error) {
       message = error instanceof Error ? error.message : 'unknown';
     }
   });
 </script>
 <symbiote-view testID="mismatch" accessibilityLabel={message} />`;

async function mountWithScreen(variant: string, screenSource: string): Promise<unknown> {
  const dir = __dirname;
  await harness.compileSource(dir, `${variant}-screen`, screenSource);
  const app = await harness.compileSource(
    dir,
    `${variant}-app`,
    `<script lang="ts">
       import Stack from '../stack/index.svelte';
       import Screen from '../screen.svelte';
       import Probe from './${variant}-screen.svelte';
       let { onReady }: { onReady?: (handle: unknown) => void } = $props();
       let navigator = $state.raw<unknown>(null);
       $effect(() => { if (navigator !== null) onReady?.(navigator); });
     </script>
     <Stack bind:this={navigator}><Screen name="home" component={Probe} /><Screen name="details" component={Probe} /></Stack>`,
  );
  let handle: unknown = null;
  mount(ROOT_TAG, await loadComponent(app), {
    onReady: (value: unknown) => {
      handle = value;
    },
  });
  await tick();
  await tick();
  return handle;
}

function isStackHandle(value: unknown): value is INavigatorHandle {
  return typeof value === 'object' && value !== null && 'push' in value;
}

function probeLabel(testID: string): string {
  const label = findLiveByTestId(fabric.appRoot(), testID)?.props?.accessibilityLabel;
  return typeof label === 'string' ? label : '';
}

describe('navigation runes (real compiled components)', () => {
  it('exposes route, navigation, narrowed handle and navigation state to a mounted screen', async () => {
    await mountWithScreen('surface', PROBE_SOURCE);
    // name:params | routeCount | focusRuns | cleanupRuns | typeof push | typeof addListener | rootScope
    expect(probeLabel('probe')).toBe('home:none|1|0|0|function|function|true');
  });

  it('runs useFocusEffect on focus and its cleanup on blur', async () => {
    await mountWithScreen('focus', PROBE_SOURCE);
    const screen = findLive(fabric.appRoot(), 'RNSScreen');
    expect(screen).toBeDefined();
    if (screen === undefined) return;

    fabric.fireEvent(screen.instanceHandle, 'topAppear', {});
    await tick();
    await tick();
    expect(probeLabel('probe').split('|').slice(2, 4)).toEqual(['1', '0']);

    fabric.fireEvent(screen.instanceHandle, 'topDisappear', {});
    await tick();
    await tick();
    expect(probeLabel('probe').split('|').slice(2, 4)).toEqual(['1', '1']);
  });

  it('re-runs useNavigationState when the router broadcasts a new state', async () => {
    const handle = await mountWithScreen('state', PROBE_SOURCE);
    expect(probeLabel('probe').split('|')[1]).toBe('1');
    if (!isStackHandle(handle)) throw new Error('Stack did not expose a navigator handle');

    handle.push('details');
    await tick();
    await tick();
    // Both routes stay mounted on a Stack, so the FIRST screen's selector sees the new count too.
    expect(probeLabel('probe').split('|')[1]).toBe('2');
  });

  it('re-reads the route through the scope getter after setParams', async () => {
    const handle = await mountWithScreen('params', PROBE_SOURCE);
    if (!isStackHandle(handle)) throw new Error('Stack did not expose a navigator handle');
    expect(probeLabel('probe').split('|')[0]).toBe('home:none');

    handle.setParams('updated');
    await tick();
    await tick();
    expect(probeLabel('probe').split('|')[0]).toBe('home:updated');
  });

  it('throws a named error when a narrowed rune meets the wrong navigator kind', async () => {
    await mountWithScreen('mismatch', MISMATCH_PROBE_SOURCE);
    expect(probeLabel('mismatch')).toContain('nearest navigator is not a Tab');
  });

  it('throws when a rune is used outside any navigator', async () => {
    const dir = __dirname;
    const app = await harness.compileSource(
      dir,
      'orphan-app',
      `<script lang="ts">
         import { useRoute } from './use-route.svelte';
         let message = 'no error';
         try {
           useRoute();
         } catch (error) {
           message = error instanceof Error ? error.message : 'unknown';
         }
       </script>
       <symbiote-view testID="orphan" accessibilityLabel={message} />`,
    );
    mount(ROOT_TAG, await loadComponent(app));
    await tick();
    await tick();
    expect(probeLabel('orphan')).toContain(
      'useRoute must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>',
    );
  });
});
