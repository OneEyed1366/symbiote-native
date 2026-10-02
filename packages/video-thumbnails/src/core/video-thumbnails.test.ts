import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_VIDEO_THUMBNAILS = {
  getThumbnail: vi.fn(async () => ({
    uri: 'file:///thumb.jpg',
    width: 100,
    height: 100,
  })),
};

// requireNativeModule() only resolves on-device — faked in place of expo-modules-core's runtime
// resolution, same pattern as packages/print/src/core/print.test.ts.
vi.mock('./native-module', () => ({
  expoVideoThumbnails: FAKE_NATIVE_VIDEO_THUMBNAILS,
}));

const { getThumbnailAsync } = await import('./video-thumbnails');

afterEach(() => {
  vi.clearAllMocks();
});

describe('getThumbnailAsync', () => {
  it('defaults options to an empty object', async () => {
    await getThumbnailAsync('file:///video.mp4');
    expect(FAKE_NATIVE_VIDEO_THUMBNAILS.getThumbnail).toHaveBeenCalledWith(
      'file:///video.mp4',
      {},
    );
  });

  it('forwards quality/time/headers to the native module', async () => {
    await getThumbnailAsync('https://example.com/video.mp4', {
      quality: 0.5,
      time: 2000,
      headers: { Authorization: 'Bearer x' },
    });
    expect(FAKE_NATIVE_VIDEO_THUMBNAILS.getThumbnail).toHaveBeenCalledWith(
      'https://example.com/video.mp4',
      { quality: 0.5, time: 2000, headers: { Authorization: 'Bearer x' } },
    );
  });

  it('resolves with the native result', async () => {
    await expect(getThumbnailAsync('file:///video.mp4')).resolves.toEqual({
      uri: 'file:///thumb.jpg',
      width: 100,
      height: 100,
    });
  });
});
