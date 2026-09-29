// Svelte twin of `../react`'s `useAudioRecorderState` test, driven through the real compiler

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

const ROOT_TAG = 91_957;
const fabric = installRecordingFabric();

let harness = createSvelteHarness('audio-recorder-state');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  vi.useFakeTimers();
  harness = createSvelteHarness('audio-recorder-state');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
  vi.useRealTimers();
});

async function mountApp(name: string, appSource: string): Promise<void> {
  const app = harness.compileSource(__dirname, name, appSource);
  mount(ROOT_TAG, await loadComponent(app));
  await vi.advanceTimersByTimeAsync(0);
}

const PROBE_APP = `<script lang="ts">
   import { useAudioRecorderState } from './use-audio-recorder-state.svelte';
   let status = { isRecording: false, durationMillis: 0 };
   const recorder = { getStatus: () => status };
   const state = useAudioRecorderState(recorder as any, 10);
   Object.assign(globalThis, {
     __capturedState: () => state.current,
     __setStatus: (next: { isRecording: boolean; durationMillis: number }) => { status = next; },
   });
 </script>`;

describe('useAudioRecorderState (Positive: reads the initial status, polls for a meaningful change)', () => {
  it('returns the recorder initial status', async () => {
    await mountApp('recorder-state-probe-app', PROBE_APP);
    const captured = (globalThis as { __capturedState?: () => unknown })
      .__capturedState;

    expect(captured?.()).toEqual({ isRecording: false, durationMillis: 0 });
  });

  it('updates after a poll observes a meaningful change', async () => {
    await mountApp('recorder-state-update-app', PROBE_APP);
    const captured = (globalThis as { __capturedState?: () => unknown })
      .__capturedState;
    const setStatus = (
      globalThis as {
        __setStatus?: (next: {
          isRecording: boolean;
          durationMillis: number;
        }) => void;
      }
    ).__setStatus;

    setStatus?.({ isRecording: true, durationMillis: 0 });
    await vi.advanceTimersByTimeAsync(10);

    expect(captured?.()).toEqual({ isRecording: true, durationMillis: 0 });
  });
});
