// Svelte twin of `../react`'s `useAudioPlaylistStatus` test, driven through the real compiler

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

const ROOT_TAG = 91_955;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('audio-playlist-status');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('audio-playlist-status');
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
   import { useAudioPlaylistStatus } from './use-audio-playlist-status.svelte';
   let listener: ((value: { currentIndex: number }) => void) | undefined;
   const playlist = {
     currentStatus: { currentIndex: 0 },
     addListener: (_event: string, cb: (value: { currentIndex: number }) => void) => {
       listener = cb;
       return { remove: () => {} };
     },
   };
   const status = useAudioPlaylistStatus(() => playlist as any);
   Object.assign(globalThis, {
     __capturedStatus: () => status.current,
     __emit: (value: { currentIndex: number }) => listener?.(value),
   });
 </script>`;

describe('useAudioPlaylistStatus (Positive: reads current status, updates on playlistStatusUpdate)', () => {
  it('returns the playlist current status', async () => {
    await mountApp('playlist-status-probe-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedStatus?: () => { currentIndex: number } }
    ).__capturedStatus;

    expect(captured?.()).toEqual({ currentIndex: 0 });
  });

  it('updates when the playlist emits playlistStatusUpdate', async () => {
    await mountApp('playlist-status-update-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedStatus?: () => { currentIndex: number } }
    ).__capturedStatus;
    const emit = (
      globalThis as { __emit?: (value: { currentIndex: number }) => void }
    ).__emit;

    emit?.({ currentIndex: 1 });
    await tick();

    expect(captured?.()).toEqual({ currentIndex: 1 });
  });
});
