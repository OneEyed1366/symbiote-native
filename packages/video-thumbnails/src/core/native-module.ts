import { requireNativeModule } from 'expo-modules-core';
import type { IVideoThumbnailsOptions, IVideoThumbnailsResult } from './types';

const EXPO_VIDEO_THUMBNAILS_MODULE_NAME = 'ExpoVideoThumbnails';

export type INativeVideoThumbnailsModule = {
  getThumbnail(
    sourceFilename: string,
    options: IVideoThumbnailsOptions,
  ): Promise<IVideoThumbnailsResult>;
};

export const expoVideoThumbnails =
  requireNativeModule<INativeVideoThumbnailsModule>(
    EXPO_VIDEO_THUMBNAILS_MODULE_NAME,
  );
