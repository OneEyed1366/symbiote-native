import { describe, expect, it, vi } from 'vitest';
import {
  subscribeAudioStreamBuffer,
  toAudioStreamKey,
} from './audio-stream-subscription';
import type { IAudioStreamBuffer } from './types';

const SAMPLE_BUFFER: IAudioStreamBuffer = {
  data: new ArrayBuffer(0),
  sampleRate: 48_000,
  channels: 1,
  timestamp: 0,
};

describe('subscribeAudioStreamBuffer (Positive: forwards buffer events, unsubscribes on cleanup)', () => {
  it('forwards buffer events to the listener', () => {
    const listeners: Array<(buffer: IAudioStreamBuffer) => void> = [];
    const stream = {
      addListener: vi.fn(
        (_event: string, listener: (buffer: IAudioStreamBuffer) => void) => {
          listeners.push(listener);
          return { remove: vi.fn() };
        },
      ),
    };
    const onBuffer = vi.fn();

    subscribeAudioStreamBuffer(stream, onBuffer);
    listeners[0]?.(SAMPLE_BUFFER);

    expect(onBuffer).toHaveBeenCalledWith(SAMPLE_BUFFER);
  });

  it('does nothing when no listener is given', () => {
    const stream = {
      addListener: vi.fn(
        (_event: string, listener: (buffer: IAudioStreamBuffer) => void) => {
          listener(SAMPLE_BUFFER);
          return { remove: vi.fn() };
        },
      ),
    };

    expect(() => subscribeAudioStreamBuffer(stream, undefined)).not.toThrow();
  });

  it('unsubscribes on cleanup', () => {
    const remove = vi.fn();
    const stream = { addListener: vi.fn(() => ({ remove })) };

    const cleanup = subscribeAudioStreamBuffer(stream, vi.fn());
    cleanup();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('toAudioStreamKey (Positive: drops onBuffer, keeps the native constructor fields)', () => {
  it('keeps sampleRate/channels/encoding', () => {
    expect(
      toAudioStreamKey({ sampleRate: 16_000, channels: 2, encoding: 'int16' }),
    ).toEqual({
      sampleRate: 16_000,
      channels: 2,
      encoding: 'int16',
    });
  });

  it('drops onBuffer', () => {
    const key = toAudioStreamKey({ sampleRate: 16_000, onBuffer: vi.fn() });

    expect(key).toEqual({
      sampleRate: 16_000,
      channels: undefined,
      encoding: undefined,
    });
  });
});
