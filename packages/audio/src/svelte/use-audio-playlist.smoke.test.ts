// Svelte twin of `../react`'s `useAudioPlaylist` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { createAudioPlaylist } = vi.hoisted(() => ({
  createAudioPlaylist: vi.fn(),
}));

vi.mock('../core/audio-playlist', () => ({ createAudioPlaylist }));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_954;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('audio-playlist');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('audio-playlist');
  createAudioPlaylist.mockImplementation(() => ({ destroy: vi.fn() }));
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
   import { useAudioPlaylist } from './use-audio-playlist.svelte';
   let loop = $state<'none' | 'all'>('none');
   const playlist = useAudioPlaylist(() => ({ loop }));
   Object.assign(globalThis, {
     __capturedPlaylist: () => playlist.current,
     __setLoop: (next: 'none' | 'all') => { loop = next; },
   });
 </script>`;

describe('useAudioPlaylist (Positive: creates once, recreates on options change, disposes the stale one)', () => {
  it('creates a playlist for the initial options', async () => {
    await mountApp('playlist-probe-app', PROBE_APP);

    expect(createAudioPlaylist).toHaveBeenCalledWith({ loop: 'none' });
  });

  it('recreates and disposes the stale playlist when options change', async () => {
    await mountApp('playlist-change-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedPlaylist?: () => { destroy: () => void } }
    ).__capturedPlaylist;
    const setLoop = (
      globalThis as { __setLoop?: (next: 'none' | 'all') => void }
    ).__setLoop;
    const stale = captured?.();

    setLoop?.('all');
    await tick();

    expect(captured?.()).not.toBe(stale);
    expect(stale?.destroy).toHaveBeenCalledTimes(1);
  });

  it('disposes the current playlist on unmount', async () => {
    await mountApp('playlist-unmount-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedPlaylist?: () => { destroy: () => void } }
    ).__capturedPlaylist;
    const current = captured?.();

    unmount(ROOT_TAG);

    expect(current?.destroy).toHaveBeenCalledTimes(1);
  });
});
