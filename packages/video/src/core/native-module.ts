import { requireNativeModule } from 'expo-modules-core';
import { VIDEO_MODULE_NAME } from './constants';
import type { VideoPlayer, VideoThumbnail } from './player-types';

export type INativeVideoModule = {
  VideoPlayer: typeof VideoPlayer;
  VideoThumbnail: typeof VideoThumbnail;
  isPictureInPictureSupported(): boolean;
  setVideoCacheSizeAsync(sizeBytes: number): Promise<void>;
  clearVideoCacheAsync(): Promise<void>;
  getCurrentVideoCacheSize(): number;
};

export const expoVideo =
  requireNativeModule<INativeVideoModule>(VIDEO_MODULE_NAME);
