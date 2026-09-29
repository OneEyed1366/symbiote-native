import { describe, expect, it, vi } from 'vitest';
import { runAudioStreamBufferEffect } from './audio-stream-lifecycle';

describe('runAudioStreamBufferEffect (Positive: subscribes once, registers cleanup, re-reads onBuffer each run)', () => {
  it('subscribes the current stream to buffer events inside the effect', () => {
    const addListener = vi.fn(() => ({ remove: vi.fn() }));
    const stream = { addListener };

    runAudioStreamBufferEffect(
      () => stream,
      () => vi.fn(),
      fn => fn(),
      vi.fn(),
    );

    expect(addListener).toHaveBeenCalledWith(
      'audioStreamBuffer',
      expect.any(Function),
    );
  });

  it('registers the unsubscribe as cleanup', () => {
    const remove = vi.fn();
    const stream = { addListener: vi.fn(() => ({ remove })) };
    const cleanups: Array<() => void> = [];

    runAudioStreamBufferEffect(
      () => stream,
      () => undefined,
      fn => fn(),
      cleanup => cleanups.push(cleanup),
    );
    for (const cleanup of cleanups) cleanup();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('forwards a buffer event to the current onBuffer', () => {
    const listeners: Array<(buffer: unknown) => void> = [];
    const stream = {
      addListener: vi.fn(
        (_event: string, listener: (buffer: unknown) => void) => {
          listeners.push(listener);
          return { remove: vi.fn() };
        },
      ),
    };
    const onBuffer = vi.fn();

    runAudioStreamBufferEffect(
      () => stream,
      () => onBuffer,
      fn => fn(),
      vi.fn(),
    );
    listeners[0]?.({ data: new ArrayBuffer(0) });

    expect(onBuffer).toHaveBeenCalledWith({ data: new ArrayBuffer(0) });
  });
});
