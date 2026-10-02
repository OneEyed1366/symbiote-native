// Angular twin of `../react`'s `useAudioStream` test

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioStream } = vi.hoisted(() => ({
  createAudioStream: vi.fn(),
}));

vi.mock('../core/audio-stream', () => ({ createAudioStream }));

const { injectAudioStream } = await import('./inject-audio-stream');

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

const ROOT_TAG = 1705;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedHost: HostFixture | undefined;

@Component({ selector: 'audio-stream-host', standalone: true, template: '' })
class HostFixture {
  readonly sampleRate = signal(16_000);
  readonly onBuffer = vi.fn();
  readonly result = injectAudioStream(() => ({
    sampleRate: this.sampleRate(),
    onBuffer: this.onBuffer,
  }));
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  capturedHost = undefined;
  createAudioStream.mockImplementation(createStream);
});

afterEach(() => unmount(ROOT_TAG));

describe('injectAudioStream (Positive: creates once, exposes isStreaming, forwards buffers, releases)', () => {
  it('creates a stream for the initial options', () => {
    mount(ROOT_TAG, HostFixture);

    expect(createAudioStream).toHaveBeenCalledWith({
      sampleRate: 16_000,
      channels: undefined,
      encoding: undefined,
    });
    expect(capturedHost?.result().stream).toBeDefined();
  });

  it('reflects isStreaming from the status event', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();

    expect(capturedHost?.result().isStreaming).toBe(false);
    const [, listener] =
      capturedHost
        ?.result()
        .stream.addListener.mock.calls.find(
          (call: unknown[]) => call[0] === 'audioStreamStatus',
        ) ?? [];
    listener?.({ isStreaming: true });
    await tick();

    expect(capturedHost?.result().isStreaming).toBe(true);
  });

  it('forwards buffer events to onBuffer', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();

    const [, listener] =
      capturedHost
        ?.result()
        .stream.addListener.mock.calls.find(
          (call: unknown[]) => call[0] === 'audioStreamBuffer',
        ) ?? [];
    const buffer = {
      data: new ArrayBuffer(0),
      sampleRate: 16_000,
      channels: 1,
      timestamp: 0,
    };
    listener?.(buffer);

    expect(capturedHost?.onBuffer).toHaveBeenCalledWith(buffer);
  });

  it('releases the stream on unmount', () => {
    mount(ROOT_TAG, HostFixture);
    const current = capturedHost?.result().stream;

    unmount(ROOT_TAG);

    expect(current?.release).toHaveBeenCalledTimes(1);
  });
});
