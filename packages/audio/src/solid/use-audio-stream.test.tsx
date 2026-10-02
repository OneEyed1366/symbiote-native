// Solid twin of `../react`'s `useAudioStream` test

import type { Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioStream } = vi.hoisted(() => ({
  createAudioStream: vi.fn(),
}));

vi.mock('../core/audio-stream', () => ({ createAudioStream }));

const { useAudioStream } = await import('./use-audio-stream');

const ROOT_TAG = 1704;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

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

let captured: Accessor<ReturnType<typeof useAudioStream>> | undefined;
let onBuffer: ReturnType<typeof vi.fn>;

function Probe(props: { initial: number }): null {
  onBuffer = vi.fn();
  captured = useAudioStream(() => ({ sampleRate: props.initial, onBuffer }));
  return null;
}

function mountHarness(initial: number): void {
  mount(ROOT_TAG, () => <Probe initial={initial} />);
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  createAudioStream.mockImplementation(createStream);
});

afterEach(() => unmount(ROOT_TAG));

describe('useAudioStream (Positive: creates once, exposes isStreaming, forwards buffers, releases)', () => {
  it('creates a stream for the initial options', async () => {
    mountHarness(16_000);
    await tick();

    expect(createAudioStream).toHaveBeenCalledWith({
      sampleRate: 16_000,
      channels: undefined,
      encoding: undefined,
    });
    expect(captured?.().stream).toBeDefined();
  });

  it('reflects isStreaming from the status event', async () => {
    mountHarness(16_000);
    await tick();

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
    mountHarness(16_000);
    await tick();

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

    expect(onBuffer).toHaveBeenCalledWith(buffer);
  });

  it('releases the stream on unmount', async () => {
    mountHarness(16_000);
    await tick();
    const current = captured?.().stream;

    unmount(ROOT_TAG);

    expect(current?.release).toHaveBeenCalledTimes(1);
  });
});
