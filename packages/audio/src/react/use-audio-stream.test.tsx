// React twin of expo-audio's `useAudioStream`

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioStream } = vi.hoisted(() => ({
  createAudioStream: vi.fn(),
}));

vi.mock('../core/audio-stream', () => ({ createAudioStream }));

const { useAudioStream } = await import('./use-audio-stream');

const ROOT_TAG = 1702;
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

let captured: ReturnType<typeof useAudioStream> | undefined;
let updateSampleRate: ((sampleRate: number) => void) | undefined;

function Harness({
  initial,
  onBuffer,
}: {
  initial: number;
  onBuffer?: (buffer: unknown) => void;
}): null {
  const [sampleRate, setSampleRate] = useState(initial);
  updateSampleRate = setSampleRate;
  captured = useAudioStream({ sampleRate, onBuffer });
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  updateSampleRate = undefined;
  createAudioStream.mockImplementation(createStream);
});

afterEach(() => unmount(ROOT_TAG));

describe('useAudioStream (Positive: creates once, exposes isStreaming, forwards buffers, releases)', () => {
  it('creates a stream for the initial options', async () => {
    mount(ROOT_TAG, <Harness initial={16_000} />);
    await tick();

    expect(createAudioStream).toHaveBeenCalledWith({
      sampleRate: 16_000,
      channels: undefined,
      encoding: undefined,
    });
    expect(captured?.stream).toBeDefined();
  });

  it('returns the same stream across re-renders with unchanged options', async () => {
    mount(ROOT_TAG, <Harness initial={16_000} />);
    await tick();
    const first = captured?.stream;

    updateSampleRate?.(16_000);
    await tick();

    expect(captured?.stream).toBe(first);
    expect(createAudioStream).toHaveBeenCalledTimes(1);
  });

  it('reflects isStreaming from the status event', async () => {
    mount(ROOT_TAG, <Harness initial={16_000} />);
    await tick();

    expect(captured?.isStreaming).toBe(false);
    const [, listener] =
      captured?.stream.addListener.mock.calls.find(
        (call: unknown[]) => call[0] === 'audioStreamStatus',
      ) ?? [];
    listener?.({ isStreaming: true });
    await tick();

    expect(captured?.isStreaming).toBe(true);
  });

  it('forwards buffer events to onBuffer', async () => {
    const onBuffer = vi.fn();
    mount(ROOT_TAG, <Harness initial={16_000} onBuffer={onBuffer} />);
    await tick();

    const [, listener] =
      captured?.stream.addListener.mock.calls.find(
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
    mount(ROOT_TAG, <Harness initial={16_000} />);
    await tick();
    const current = captured?.stream;

    unmount(ROOT_TAG);

    expect(current?.release).toHaveBeenCalledTimes(1);
  });
});
