// A `Stack` left alone must not commit, since a write at rest adds memory on a device every frame
// The control screen writes state from a timer, so a silent detector cannot pass as a clean idle

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
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
const IDLE_WAIT_MS = 300;

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('stack-idle');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('stack-idle');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const QUIET_SCREEN = `<view p={{ testID: 'quiet' }} />`;

const TICKING_SCREEN = `<script lang="ts">
     let ticks = $state(0);
     $effect(() => {
       const id = setInterval(() => { ticks += 1; }, 1);
       return () => clearInterval(id);
     });
   </script>
   <view p={{ testID: 'ticking', accessibilityLabel: String(ticks) }} />`;

async function mountStackOf(screenName: string, source: string): Promise<void> {
  const dir = __dirname;
  harness.compileSource(dir, `${screenName}-screen`, source);
  const app = harness.compileSource(
    dir,
    `${screenName}-idle-app`,
    `<script lang="ts">
     import Stack from './index.svelte';
     import Screen from '../screen.svelte';
     import Home from './${screenName}-screen.svelte';
   </script>
   <Stack>
     <Screen name="home" component={Home} />
   </Stack>`,
  );
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

async function commitsWhileWaiting(ms: number): Promise<number> {
  const before = fabric.commits;
  await new Promise(resolve => setTimeout(resolve, ms));
  return fabric.commits - before;
}

describe('Stack at rest (Positive: a mounted navigator stays quiet)', () => {
  it('commits nothing while a quiet screen is left alone', async () => {
    await mountStackOf('quiet', QUIET_SCREEN);

    const committed = await commitsWhileWaiting(IDLE_WAIT_MS);

    expect(committed).toBe(0);
  });

  it('commits when a screen writes state from a timer, which proves the count can move', async () => {
    await mountStackOf('ticking', TICKING_SCREEN);

    const committed = await commitsWhileWaiting(IDLE_WAIT_MS);

    expect(committed).toBeGreaterThan(0);
  });
});
