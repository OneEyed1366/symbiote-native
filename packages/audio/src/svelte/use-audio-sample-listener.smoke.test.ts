// Svelte twin of `../react`'s `useAudioSampleListener` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_953;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('audio-sample-listener');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('audio-sample-listener');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

async function mountApp(name: string, appSource: string): Promise<void> {
  const app = harness.compileSource(__dirname, name, appSource);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

const PROBE_APP = `<script lang="ts">
   import { useAudioSampleListener } from './use-audio-sample-listener.svelte';
   let sampled: unknown;
   const player = {
     isAudioSamplingSupported: true,
     setAudioSamplingEnabled: (_enabled: boolean) => {},
     addListener: (_event: string, cb: (data: unknown) => void) => {
       (globalThis as any).__emit = cb;
       return { remove: () => {} };
     },
   };
   useAudioSampleListener(player as any, data => { sampled = data; });
   Object.assign(globalThis, { __captured: () => sampled });
 </script>`;

describe('useAudioSampleListener (Positive: enables sampling, forwards samples)', () => {
  it('forwards emitted samples to the listener', async () => {
    await mountApp('sample-listener-app', PROBE_APP);
    const emit = (globalThis as { __emit?: (data: unknown) => void }).__emit;
    const captured = (globalThis as { __captured?: () => unknown }).__captured;

    emit?.({ channels: [] });
    await tick();

    expect(captured?.()).toEqual({ channels: [] });
  });
});
