import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import { IMAGE_MODULE_NAME } from './constants';
import type {
  IImageCacheConfig,
  IImageLoadOptions,
  IImagePrefetchOptions,
  IImageSource,
  ImageRef,
} from './types';

export type INativeImageModule = {
  Image: typeof ImageRef;
  loadAsync(
    source: IImageSource,
    options?: Omit<IImageLoadOptions, 'onError' | 'tintColor'> & {
      /** What `processColor` answers */
      tintColor?: unknown;
    },
  ): Promise<ImageRef>;
  prefetch(
    urls: string[],
    cachePolicy: IImagePrefetchOptions['cachePolicy'],
    headers?: Record<string, string>,
  ): Promise<boolean>;
  clearMemoryCache(): Promise<boolean>;
  clearDiskCache(): Promise<boolean>;
  configureCache(config: IImageCacheConfig): void;
  getCachePathAsync(cacheKey: string): Promise<string | null>;
  writeToCacheAsync(source: string | ImageRef, cacheKey: string): Promise<void>;
  readFromCacheAsync(cacheKey: string): Promise<ImageRef | null>;
  generateBlurhashAsync(
    source: string | ImageRef,
    numberOfComponents: [number, number] | { width: number; height: number },
  ): Promise<string | null>;
  generateThumbhashAsync(source: string | ImageRef): Promise<string>;
  addListener(
    eventName: string,
    listener: (event: { url: string; width: number; height: number }) => void,
  ): EventSubscription;
};

export const expoImage =
  requireNativeModule<INativeImageModule>(IMAGE_MODULE_NAME);
