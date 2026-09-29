import { describe, expect, it, vi } from 'vitest';

const { createAudioPlaylist } = vi.hoisted(() => ({
  createAudioPlaylist: vi.fn((options: unknown) => ({
    options,
    destroy: vi.fn(),
  })),
}));

vi.mock('./audio-playlist', () => ({ createAudioPlaylist }));

const { createAudioPlaylistController } =
  await import('./audio-playlist-controller');

describe('createAudioPlaylistController (Positive: recreates on options change)', () => {
  it('reuses the same playlist for unchanged options', () => {
    const controller = createAudioPlaylistController();

    const first = controller.resolve({ sources: [] });
    const second = controller.resolve({ sources: [] });

    expect(first).toBe(second);
  });

  it('creates a new playlist when options change, deferring disposal of the old one', () => {
    const controller = createAudioPlaylistController();

    const first = controller.resolve({ sources: [] });
    const second = controller.resolve({ loop: 'all' });

    expect(second).not.toBe(first);
    expect(first.destroy).not.toHaveBeenCalled();

    controller.flushDispose();

    expect(first.destroy).toHaveBeenCalledTimes(1);
  });

  it('dispose() releases the current playlist', () => {
    const controller = createAudioPlaylistController();

    const playlist = controller.resolve({ sources: [] });
    controller.dispose();

    expect(playlist.destroy).toHaveBeenCalledTimes(1);
  });
});
