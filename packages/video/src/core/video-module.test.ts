import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  isPictureInPictureSupported: vi.fn(() => true),
  setVideoCacheSizeAsync: vi.fn(async (_size: number) => undefined),
  clearVideoCacheAsync: vi.fn(async () => undefined),
  getCurrentVideoCacheSize: vi.fn(() => 1_024),
}));

vi.mock('./native-module', () => ({ expoVideo: native }));

const video = await import('./video-module');

beforeEach(() => vi.clearAllMocks());

describe('video module functions', () => {
  it('asks the device about Picture in Picture', () => {
    expect(video.isPictureInPictureSupported()).toBe(true);
  });

  it('sets the cache size in bytes', async () => {
    await video.setVideoCacheSizeAsync(2_048);

    expect(native.setVideoCacheSizeAsync).toHaveBeenCalledWith(2_048);
  });

  it('clears the cache', async () => {
    await video.clearVideoCacheAsync();

    expect(native.clearVideoCacheAsync).toHaveBeenCalledTimes(1);
  });

  it('reads the space the cache occupies', () => {
    expect(video.getCurrentVideoCacheSize()).toBe(1_024);
  });
});
