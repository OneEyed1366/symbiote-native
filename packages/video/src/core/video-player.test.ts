import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  constructed: [] as unknown[][],
  replace: vi.fn(),
  replaceAsync: vi.fn(async (_source: unknown) => undefined),
}));

vi.mock('./native-module', () => {
  class FakeNativeVideoPlayer {
    constructor(...args: unknown[]) {
      calls.constructed.push(args);
    }
    replace(source: unknown): void {
      calls.replace(source);
    }
    replaceAsync(source: unknown): Promise<void> {
      return calls.replaceAsync(source);
    }
  }
  return { expoVideo: { VideoPlayer: FakeNativeVideoPlayer } };
});

vi.mock('./video-source', () => ({
  parseSource: (source: unknown) => ({ parsed: source }),
}));

const { createVideoPlayer } = await import('./video-player');

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  calls.constructed.length = 0;
  vi.clearAllMocks();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  warn.mockClear();
});

describe('createVideoPlayer (Positive)', () => {
  it('builds the native player from the parsed source, with the options', () => {
    createVideoPlayer('a.mp4', { seekForwardIncrement: 5 });

    expect(calls.constructed).toEqual([
      [{ parsed: 'a.mp4' }, false, { seekForwardIncrement: 5 }],
    ]);
  });

  it('parses the source of replaceAsync before the native player sees it', async () => {
    const player = createVideoPlayer('a.mp4');

    await player.replaceAsync('b.mp4');

    expect(calls.replaceAsync).toHaveBeenCalledWith({ parsed: 'b.mp4' });
  });

  it('parses the source of replace and warns about the synchronous load', () => {
    const player = createVideoPlayer('a.mp4');

    player.replace('b.mp4');

    expect(calls.replace).toHaveBeenCalledWith({ parsed: 'b.mp4' });
    expect(warn).toHaveBeenCalledWith(
      'On iOS `VideoPlayer.replace` loads the asset data synchronously on the main thread, which can lead to UI freezes and will be deprecated in a future release. Switch to `replaceAsync` for better user experience.',
    );
  });

  it('stays quiet when the warning is disabled', () => {
    const player = createVideoPlayer('a.mp4');

    player.replace('b.mp4', true);

    expect(warn).not.toHaveBeenCalled();
  });
});
