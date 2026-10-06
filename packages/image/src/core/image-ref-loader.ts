import { loadImageAsync } from './image-api';
import { createImageLoader } from './image-loader';
import type { IImageLoader } from './image-loader';
import type { IImageLoadOptions, ImageRef } from './types';

/** The loader every `useImage` hook drives, `getOptions` is read at each load and failure */
export function createImageRefLoader(
  onImage: (image: ImageRef) => void,
  getOptions: () => IImageLoadOptions,
): IImageLoader {
  return createImageLoader<ImageRef>({
    load: loadImageAsync,
    onImage,
    getOptions,
  });
}
