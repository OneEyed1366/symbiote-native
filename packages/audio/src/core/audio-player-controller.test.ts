import { describe, expect, it, vi } from 'vitest';

const { createAudioPlayer } = vi.hoisted(() => ({
  createAudioPlayer: vi.fn((source: unknown, options: unknown) => ({
    source,
    options,
    remove: vi.fn(),
  })),
}));

vi.mock('./audio-player', () => ({ createAudioPlayer }));

const { createAudioPlayerController } =
  await import('./audio-player-controller');

describe('createAudioPlayerController (Positive: recreates on source/options change)', () => {
  it('reuses the same player for an unchanged source and options', () => {
    const controller = createAudioPlayerController();

    const first = controller.resolve('a.mp3', {});
    const second = controller.resolve('a.mp3', {});

    expect(first).toBe(second);
  });

  it('creates a new player when the source changes, deferring disposal of the old one', () => {
    const controller = createAudioPlayerController();

    const first = controller.resolve('a.mp3', {});
    const second = controller.resolve('b.mp3', {});

    expect(second).not.toBe(first);
    expect(first.remove).not.toHaveBeenCalled();

    controller.flushDispose();

    expect(first.remove).toHaveBeenCalledTimes(1);
  });

  it('creates a new player when updateInterval changes', () => {
    const controller = createAudioPlayerController();

    const first = controller.resolve('a.mp3', { updateInterval: 500 });
    const second = controller.resolve('a.mp3', { updateInterval: 1000 });

    expect(second).not.toBe(first);
  });

  it('dispose() releases the current player', () => {
    const controller = createAudioPlayerController();

    const player = controller.resolve('a.mp3', {});
    controller.dispose();

    expect(player.remove).toHaveBeenCalledTimes(1);
  });
});
