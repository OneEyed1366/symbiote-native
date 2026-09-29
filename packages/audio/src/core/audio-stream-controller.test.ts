import { describe, expect, it, vi } from 'vitest';

const { createAudioStream } = vi.hoisted(() => ({
  createAudioStream: vi.fn((options: unknown) => ({
    options,
    release: vi.fn(),
  })),
}));

vi.mock('./audio-stream', () => ({ createAudioStream }));

const { createAudioStreamController } =
  await import('./audio-stream-controller');

describe('createAudioStreamController (Positive: recreates on options change)', () => {
  it('reuses the same stream for unchanged options', () => {
    const controller = createAudioStreamController();

    const first = controller.resolve({ sampleRate: 48_000 });
    const second = controller.resolve({ sampleRate: 48_000 });

    expect(first).toBe(second);
  });

  it('creates a new stream when options change, deferring disposal of the old one', () => {
    const controller = createAudioStreamController();

    const first = controller.resolve({ sampleRate: 48_000 });
    const second = controller.resolve({ sampleRate: 16_000 });

    expect(second).not.toBe(first);
    expect(first.release).not.toHaveBeenCalled();

    controller.flushDispose();

    expect(first.release).toHaveBeenCalledTimes(1);
  });

  it('dispose() releases the current stream', () => {
    const controller = createAudioStreamController();

    const stream = controller.resolve({ sampleRate: 48_000 });
    controller.dispose();

    expect(stream.release).toHaveBeenCalledTimes(1);
  });
});
