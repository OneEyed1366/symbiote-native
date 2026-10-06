import { describe, expect, it, vi } from 'vitest';

const created = vi.hoisted(() => ({
  createVideoPlayer: vi.fn((source: unknown, options: unknown) => ({
    source,
    options,
    release: vi.fn(),
  })),
}));

vi.mock('./video-player', () => created);
vi.mock('./video-source', () => ({
  parseSource: (source: unknown) =>
    typeof source === 'string' ? { uri: source } : source,
}));

const { createVideoPlayerController } =
  await import('./video-player-controller');

describe('createVideoPlayerController (Positive)', () => {
  it('builds the player from the parsed source and the options', () => {
    const controller = createVideoPlayerController();

    const player = controller.resolve('a.mp4', { seekForwardIncrement: 5 });

    expect(created.createVideoPlayer).toHaveBeenCalledWith(
      { uri: 'a.mp4' },
      { seekForwardIncrement: 5 },
    );
    expect(player.release).not.toHaveBeenCalled();
  });

  it('runs the setup on the player it just created', () => {
    const setup = vi.fn();

    const player = createVideoPlayerController().resolve(
      'a.mp4',
      undefined,
      setup,
    );

    expect(setup).toHaveBeenCalledWith(player);
  });

  it('reuses the player while the source and options are equal by value', () => {
    const controller = createVideoPlayerController();
    const setup = vi.fn();

    const first = controller.resolve(
      'a.mp4',
      { seekForwardIncrement: 5 },
      setup,
    );
    const second = controller.resolve(
      'a.mp4',
      { seekForwardIncrement: 5 },
      setup,
    );

    expect(second).toBe(first);
    expect(setup).toHaveBeenCalledTimes(1);
  });

  it('recreates the player when the source changes and releases the old one on flush', () => {
    const controller = createVideoPlayerController();

    const first = controller.resolve('a.mp4');
    const second = controller.resolve('b.mp4');
    expect(first.release).not.toHaveBeenCalled();
    controller.flushDispose();

    expect(second).not.toBe(first);
    expect(first.release).toHaveBeenCalledTimes(1);
  });

  it('releases the current player on dispose', () => {
    const controller = createVideoPlayerController();

    const player = controller.resolve('a.mp4');
    controller.dispose();

    expect(player.release).toHaveBeenCalledTimes(1);
  });
});
