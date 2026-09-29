// Svelte twin of `../react`'s `useAudioPlayer` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { createAudioPlayer } = vi.hoisted(() => ({
  createAudioPlayer: vi.fn(),
}));

vi.mock('../core/audio-player', () => ({ createAudioPlayer }));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_951;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('audio-player');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('audio-player');
  createAudioPlayer.mockImplementation(() => ({ remove: vi.fn() }));
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
   import { useAudioPlayer } from './use-audio-player.svelte';
   let source = $state('a.mp3');
   const player = useAudioPlayer(() => source);
   Object.assign(globalThis, {
     __capturedPlayer: () => player.current,
     __setSource: (next: string) => { source = next; },
   });
 </script>`;

describe('useAudioPlayer (Positive: creates once, recreates on source change, disposes the stale one)', () => {
  it('creates a player for the initial source', async () => {
    await mountApp('probe-app', PROBE_APP);

    expect(createAudioPlayer).toHaveBeenCalledWith('a.mp3', {});
  });

  it('recreates and disposes the stale player when the source changes', async () => {
    await mountApp('change-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedPlayer?: () => { remove: () => void } }
    ).__capturedPlayer;
    const setSource = (globalThis as { __setSource?: (next: string) => void })
      .__setSource;
    const stale = captured?.();

    setSource?.('b.mp3');
    await tick();

    expect(captured?.()).not.toBe(stale);
    expect(stale?.remove).toHaveBeenCalledTimes(1);
  });

  it('disposes the current player on unmount', async () => {
    await mountApp('unmount-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedPlayer?: () => { remove: () => void } }
    ).__capturedPlayer;
    const current = captured?.();

    unmount(ROOT_TAG);

    expect(current?.remove).toHaveBeenCalledTimes(1);
  });
});
