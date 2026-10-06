import { toNativeColor } from './native-style';
import { expoImage } from './native-module';
import { resolveSource } from './sources';
import type {
  IImageCacheConfig,
  IImageLoadOptions,
  IImagePrefetchOptions,
  IImageSource,
  ImageRef,
} from './types';

const DEFAULT_CACHE_POLICY = 'memory-disk';

type IPrefetchOptions =
  IImagePrefetchOptions['cachePolicy'] | IImagePrefetchOptions;

/** The caching policy as a string, or with request headers as an object */
export function prefetchImages(
  urls: string | string[],
  options?: IPrefetchOptions,
): Promise<boolean> {
  const { cachePolicy = DEFAULT_CACHE_POLICY, headers } =
    typeof options === 'string' ? { cachePolicy: options } : (options ?? {});
  return expoImage.prefetch(
    Array.isArray(urls) ? urls : [urls],
    cachePolicy,
    headers,
  );
}

export const clearMemoryCache = (): Promise<boolean> =>
  expoImage.clearMemoryCache();

export const clearDiskCache = (): Promise<boolean> =>
  expoImage.clearDiskCache();

export const getCachePathAsync = (cacheKey: string): Promise<string | null> =>
  expoImage.getCachePathAsync(cacheKey);

export const writeToCacheAsync = (
  source: string | ImageRef,
  cacheKey: string,
): Promise<void> => expoImage.writeToCacheAsync(source, cacheKey);

export const readFromCacheAsync = (
  cacheKey: string,
): Promise<ImageRef | null> => expoImage.readFromCacheAsync(cacheKey);

export const configureCache = (config: IImageCacheConfig): void =>
  expoImage.configureCache(config);

export const generateBlurhashAsync = (
  source: string | ImageRef,
  numberOfComponents: [number, number] | { width: number; height: number },
): Promise<string | null> =>
  expoImage.generateBlurhashAsync(source, numberOfComponents);

export const generateThumbhashAsync = (
  source: string | ImageRef,
): Promise<string> => expoImage.generateThumbhashAsync(source);

/** Loads the image into a native `ImageRef`, the caller releases it */
export async function loadImageAsync(
  source: IImageSource | string | number,
  options: IImageLoadOptions = {},
): Promise<ImageRef> {
  const resolved = resolveSource(source);
  if (!resolved) {
    throw new Error('[expo-image]: the image source could not be resolved');
  }
  const { maxWidth, maxHeight, tintColor } = options;
  return expoImage.loadAsync(resolved, {
    maxWidth,
    maxHeight,
    tintColor: toNativeColor(tintColor),
  });
}
