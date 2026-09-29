// Svelte twin of `../react`'s `useAudioRecorder` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { createAudioRecorder } = vi.hoisted(() => ({
  createAudioRecorder: vi.fn(),
}));

vi.mock('../core/audio-recorder', () => ({ createAudioRecorder }));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_956;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('audio-recorder');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('audio-recorder');
  createAudioRecorder.mockImplementation(() => ({
    release: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
  }));
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
   import { useAudioRecorder } from './use-audio-recorder.svelte';
   let sampleRate = $state(44100);
   const recorder = useAudioRecorder(() => ({ sampleRate }));
   Object.assign(globalThis, {
     __capturedRecorder: () => recorder.current,
     __setSampleRate: (next: number) => { sampleRate = next; },
   });
 </script>`;

describe('useAudioRecorder (Positive: creates once, recreates on options change, disposes the stale one)', () => {
  it('creates a recorder for the initial options', async () => {
    await mountApp('recorder-probe-app', PROBE_APP);

    expect(createAudioRecorder).toHaveBeenCalledWith({ sampleRate: 44_100 });
  });

  it('recreates and disposes the stale recorder when options change', async () => {
    await mountApp('recorder-change-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedRecorder?: () => { release: () => void } }
    ).__capturedRecorder;
    const setSampleRate = (
      globalThis as { __setSampleRate?: (next: number) => void }
    ).__setSampleRate;
    const stale = captured?.();

    setSampleRate?.(48_000);
    await tick();

    expect(captured?.()).not.toBe(stale);
    expect(stale?.release).toHaveBeenCalledTimes(1);
  });

  it('disposes the current recorder on unmount', async () => {
    await mountApp('recorder-unmount-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedRecorder?: () => { release: () => void } }
    ).__capturedRecorder;
    const current = captured?.();

    unmount(ROOT_TAG);

    expect(current?.release).toHaveBeenCalledTimes(1);
  });
});
