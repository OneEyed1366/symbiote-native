// `useTransitionProgress` inside a real compiled Svelte Stack screen, driven by the native event
// The probe reports through a value listener, as an animated value is not a Svelte rune

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
import type { INativeViewConfig } from '@symbiote-native/engine';
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

const ROOT_TAG = 91_705;

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  RNSScreen: {
    directEventTypes: {
      topTransitionProgress: { registrationName: 'onTransitionProgress' },
    },
    validAttributes: { screenId: true, activityState: true },
  },
  RNSScreenStack: { directEventTypes: {}, validAttributes: {} },
  RNSScreenStackHeaderConfig: {
    directEventTypes: {},
    validAttributes: { title: true },
  },
  RNSScreenContentWrapper: {
    directEventTypes: {},
    validAttributes: { collapsable: true },
  },
};

const fabric = installRecordingFabric();
const { appRoot, findLive, findLiveByTestId } =
  createNavigationLiveTree(fabric);
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('transition-progress');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('transition-progress');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const PROBE_SOURCE = `<script lang="ts">
   import { useTransitionProgress } from './use-transition-progress.svelte';
   const transition = useTransitionProgress();
   let label = $state('idle');
   $effect(() => {
     const id = transition.goingForward.addListener(() => {
       label = [
         transition.progress.__getValue(),
         transition.closing.__getValue(),
         transition.goingForward.__getValue(),
       ].join('|');
     });
     return () => transition.goingForward.removeListener(id);
   });
 </script>
 <view p={{ testID: 'probe', accessibilityLabel: label }} />`;

function probeLabel(testID: string): string {
  const label = findLiveByTestId(appRoot(), testID)?.props?.accessibilityLabel;
  return typeof label === 'string' ? label : '';
}

describe('useTransitionProgress (real compiled components)', () => {
  it('follows the native transition event of its own screen', async () => {
    const dir = __dirname;
    harness.compileSource(dir, 'progress-screen', PROBE_SOURCE);
    const app = harness.compileSource(
      dir,
      'progress-app',
      `<script lang="ts">
         import Stack from '../stack/index.svelte';
         import Screen from '../screen.svelte';
         import Probe from './progress-screen.svelte';
       </script>
       <Stack><Screen name="home" component={Probe} /></Stack>`,
    );
    mount(ROOT_TAG, await loadComponent(app));
    await tick();
    await tick();
    const screen = findLive(appRoot(), 'RNSScreen');
    if (screen === undefined) throw new Error('stack screen did not render');

    fabric.fireEvent(screen.instanceHandle, 'topTransitionProgress', {
      progress: 0.75,
      closing: 0,
      goingForward: 1,
    });
    await tick();

    expect(probeLabel('probe')).toBe('0.75|0|1');
  });

  it('throws when used outside a screen rendered by a navigator', async () => {
    const app = harness.compileSource(
      __dirname,
      'orphan-progress-app',
      `<script lang="ts">
         import { useTransitionProgress } from './use-transition-progress.svelte';
         let message = 'no error';
         try {
           useTransitionProgress();
         } catch (error) {
           message = error instanceof Error ? error.message : 'unknown';
         }
       </script>
       <view p={{ testID: 'orphan', accessibilityLabel: message }} />`,
    );
    mount(ROOT_TAG, await loadComponent(app));
    await tick();
    await tick();

    expect(probeLabel('orphan')).toContain(
      'useTransitionProgress must be used within a screen',
    );
  });
});
