// Svelte twin of `../react`'s `useAudioPlayerStatus` test, driven through the real compiler

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

const ROOT_TAG = 91_952;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('audio-player-status');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('audio-player-status');
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
   import { useAudioPlayerStatus } from './use-audio-player-status.svelte';
   let listener: ((value: { playing: boolean }) => void) | undefined;
   const player = {
     currentStatus: { playing: false },
     addListener: (_event: string, cb: (value: { playing: boolean }) => void) => {
       listener = cb;
       return { remove: () => {} };
     },
   };
   const status = useAudioPlayerStatus(() => player as any);
   Object.assign(globalThis, {
     __capturedStatus: () => status.current,
     __emit: (value: { playing: boolean }) => listener?.(value),
   });
 </script>`;

describe('useAudioPlayerStatus (Positive: reads current status, updates on playbackStatusUpdate)', () => {
  it('returns the player current status', async () => {
    await mountApp('status-probe-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedStatus?: () => { playing: boolean } }
    ).__capturedStatus;

    expect(captured?.()).toEqual({ playing: false });
  });

  it('updates when the player emits playbackStatusUpdate', async () => {
    await mountApp('status-update-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedStatus?: () => { playing: boolean } }
    ).__capturedStatus;
    const emit = (
      globalThis as { __emit?: (value: { playing: boolean }) => void }
    ).__emit;

    emit?.({ playing: true });
    await tick();

    expect(captured?.()).toEqual({ playing: true });
  });
});
