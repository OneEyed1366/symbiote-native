import { expoVideo } from './native-module';

/** Whether the device supports Picture in Picture */
export function isPictureInPictureSupported(): boolean {
  return expoVideo.isPictureInPictureSupported();
}

/** Clears the video cache, only while no `VideoPlayer` exists */
export function clearVideoCacheAsync(): Promise<void> {
  return expoVideo.clearVideoCacheAsync();
}

/**
 * Sets the cache size in bytes, 1GB by default, and the value persists
 *
 * Only while no `VideoPlayer` exists, and the real size may be slightly larger
 */
export function setVideoCacheSizeAsync(sizeBytes: number): Promise<void> {
  return expoVideo.setVideoCacheSizeAsync(sizeBytes);
}

/** The space the video cache occupies, in bytes */
export function getCurrentVideoCacheSize(): number {
  return expoVideo.getCurrentVideoCacheSize();
}
