import { describe, expect, it, vi } from 'vitest';

const { createAudioStream } = vi.hoisted(() => ({
  createAudioStream: vi.fn((options: unknown) => ({
    options,
    isStreaming: false,
    release: vi.fn(),
  })),
}));

vi.mock('./audio-stream', () => ({ createAudioStream }));

const { createAudioStreamHooks } = await import('./audio-stream-hooks');

// Fakes the getter-based `createResourceHook`/`createEventValueHook` shape shared by
// Vue/Solid/Angular (a plain getter box, read by calling it)
function fakeCreateResourceHook(
  createController: () => { resolve: (...args: unknown[]) => unknown },
) {
  return (getArgs: () => unknown[]) => {
    const controller = createController();
    return () => controller.resolve(...getArgs());
  };
}

function fakeCreateEventValueHook<TSource, TValue>(
  _event: string,
  getValue: (source: TSource) => TValue,
) {
  return (getSource: () => TSource) => () => getValue(getSource());
}

describe('createAudioStreamHooks (Positive: binds the resource + status hooks over createAudioStreamController)', () => {
  it('resolves a stream through the bound resource hook', () => {
    const { useStreamResource } = createAudioStreamHooks(
      fakeCreateResourceHook,
      fakeCreateEventValueHook,
    );

    const stream = useStreamResource(() => [{ sampleRate: 16_000 }])();

    expect(createAudioStream).toHaveBeenCalledWith({ sampleRate: 16_000 });
    expect(stream).toBeDefined();
  });

  it('resolves isStreaming through the bound status hook', () => {
    const { useStreamResource, useStreamStatus } = createAudioStreamHooks(
      fakeCreateResourceHook,
      fakeCreateEventValueHook,
    );

    const stream = useStreamResource(() => [{ sampleRate: 16_000 }])();
    const status = useStreamStatus(() => stream)();

    expect(status).toEqual({ isStreaming: false });
  });
});
