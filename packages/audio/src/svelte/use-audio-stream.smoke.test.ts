// Svelte twin of `../react`'s `useAudioStream` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { createAudioStream } = vi.hoisted(() => ({
  createAudioStream: vi.fn(),
}));

vi.mock('../core/audio-stream', () => ({ createAudioStream }));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_958;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('audio-stream');

function createStream(): {
  isStreaming: boolean;
  release: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
} {
  return {
    isStreaming: false,
    release: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
  };
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('audio-stream');
  createAudioStream.mockImplementation(createStream);
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
   import { useAudioStream } from './use-audio-stream.svelte';
   let sampleRate = $state(16000);
   const onBuffer = (buffer: unknown) => { (globalThis as any).__buffers.push(buffer); };
   const result = useAudioStream(() => ({ sampleRate, onBuffer }));
   Object.assign(globalThis, {
     __capturedResult: () => result.current,
     __setSampleRate: (next: number) => { sampleRate = next; },
   });
 </script>`;

describe('useAudioStream (Positive: creates once, exposes isStreaming, forwards buffers, releases)', () => {
  it('creates a stream for the initial options', async () => {
    await mountApp('stream-probe-app', PROBE_APP);

    expect(createAudioStream).toHaveBeenCalledWith({
      sampleRate: 16_000,
      channels: undefined,
      encoding: undefined,
    });
  });

  it('reflects isStreaming from the status event', async () => {
    await mountApp('stream-status-app', PROBE_APP);
    const captured = (
      globalThis as {
        __capturedResult?: () => {
          stream: ReturnType<typeof createStream>;
          isStreaming: boolean;
        };
      }
    ).__capturedResult;

    expect(captured?.().isStreaming).toBe(false);
    const [, listener] =
      captured?.().stream.addListener.mock.calls.find(
        (call: unknown[]) => call[0] === 'audioStreamStatus',
      ) ?? [];
    listener?.({ isStreaming: true });
    await tick();

    expect(captured?.().isStreaming).toBe(true);
  });

  it('forwards buffer events to onBuffer', async () => {
    Object.assign(globalThis, { __buffers: [] });
    await mountApp('stream-buffer-app', PROBE_APP);
    const captured = (
      globalThis as {
        __capturedResult?: () => { stream: ReturnType<typeof createStream> };
      }
    ).__capturedResult;

    const [, listener] =
      captured?.().stream.addListener.mock.calls.find(
        (call: unknown[]) => call[0] === 'audioStreamBuffer',
      ) ?? [];
    const buffer = {
      data: new ArrayBuffer(0),
      sampleRate: 16_000,
      channels: 1,
      timestamp: 0,
    };
    listener?.(buffer);

    expect((globalThis as { __buffers?: unknown[] }).__buffers).toEqual([
      buffer,
    ]);
  });

  it('releases the stream on unmount', async () => {
    await mountApp('stream-unmount-app', PROBE_APP);
    const captured = (
      globalThis as {
        __capturedResult?: () => { stream: ReturnType<typeof createStream> };
      }
    ).__capturedResult;
    const stream = captured?.().stream;

    unmount(ROOT_TAG);

    expect(stream?.release).toHaveBeenCalledTimes(1);
  });
});
