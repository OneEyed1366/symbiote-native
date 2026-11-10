// Image statics (`getSize`, `prefetch`, `queryCache`) over the one `ImageLoader` native module
// TODO(rn-port): RN keeps these on the `Image` component module, which loads React's renderer
// Reaching them through the host would put React into every other adapter's bundle

import { dlog } from './debug';
import {
  resolveImageSource,
  type IImageSourceProp,
} from './image-source-resolver';
import { getNativeModule } from './native-modules';
import { Platform } from './platform';
import { isNumber } from './type-guards';

export type IImageSize = {
  width: number;
  height: number;
};

export type IImageCacheStatus = 'memory' | 'disk' | 'disk/memory';

type ISizeSuccess = (width: number, height: number) => void;
type ISizeFailure = (error: unknown) => void;

// One name, two signatures: Android's `prefetchImage` takes a second `requestId`
// iOS throws on the extra arg, so the call branches on `Platform.OS`
type INativeImageLoader = {
  getSize(uri: string): Promise<unknown>;
  getSizeWithHeaders(
    uri: string,
    headers: Record<string, string>,
  ): Promise<unknown>;
  // Optional so iOS passes exactly one arg, a second makes the bridgeless module throw
  prefetchImage(uri: string, requestId?: number): Promise<unknown>;
  // iOS only, and an older host may not have it
  prefetchImageWithMetadata?(
    uri: string,
    queryRootName: string,
    rootTag: number,
  ): Promise<unknown>;
  abortRequest?(requestId: number): void;
  queryCache(uris: string[]): Promise<unknown>;
};

// A module name is only provable on a real host, a headless fake answers to any name
const IMAGE_LOADER_MODULE = 'ImageLoader';

let imageLoaderModule: INativeImageLoader | null | undefined;

function getImageLoader(): INativeImageLoader | null {
  if (imageLoaderModule === undefined) {
    imageLoaderModule =
      getNativeModule<INativeImageLoader>(IMAGE_LOADER_MODULE);
    dlog(
      `Image: ImageLoader module ${imageLoaderModule ? 'resolved' : 'NOT resolved (null)'}`,
    );
  }
  return imageLoaderModule;
}

// The spec resolves a `[width, height]` array, `getSizeWithHeaders` an object
function toImageSize(result: unknown): IImageSize {
  if (Array.isArray(result) && isNumber(result[0]) && isNumber(result[1])) {
    return { width: result[0], height: result[1] };
  }
  if (typeof result === 'object' && result !== null) {
    const width = Reflect.get(result, 'width');
    const height = Reflect.get(result, 'height');
    if (isNumber(width) && isNumber(height)) return { width, height };
  }
  throw new Error(
    `Image: unexpected size result from native: ${JSON.stringify(result)}`,
  );
}

function requireLoader(method: string): INativeImageLoader {
  const loader = getImageLoader();
  if (loader === null) {
    throw new Error(
      `Image.${method}: ImageLoader native module is not available ` +
        '(running headless or not linked on this host).',
    );
  }
  return loader;
}

// A throw inside `load`, a missing module included, becomes a rejection like any native failure
async function sizeOf(load: () => Promise<unknown>): Promise<IImageSize> {
  return toImageSize(await load());
}

// As `Image.ios.js`: the promise without a success callback, else the result goes to the callbacks
// A missing `failure` becomes a warning
function deliverSize(
  promise: Promise<IImageSize>,
  uri: string,
  success: ISizeSuccess | undefined,
  failure: ISizeFailure | undefined,
): Promise<IImageSize> | undefined {
  if (typeof success !== 'function') return promise;
  promise
    .then(size => success(size.width, size.height))
    .catch(
      typeof failure === 'function'
        ? failure
        : () => console.warn('Failed to get size for image: ' + uri),
    );
  return undefined;
}

// Overloaded as RN types it: the promise without callbacks, nothing with them
function getSize(uri: string): Promise<IImageSize>;
function getSize(
  uri: string,
  success: ISizeSuccess,
  failure?: ISizeFailure,
): undefined;
function getSize(
  uri: string,
  success?: ISizeSuccess,
  failure?: ISizeFailure,
): Promise<IImageSize> | undefined {
  const promise = sizeOf(() => requireLoader('getSize').getSize(uri));
  return deliverSize(promise, uri, success, failure);
}

function getSizeWithHeaders(
  uri: string,
  headers: Record<string, string>,
): Promise<IImageSize>;
function getSizeWithHeaders(
  uri: string,
  headers: Record<string, string>,
  success: ISizeSuccess,
  failure?: ISizeFailure,
): undefined;
function getSizeWithHeaders(
  uri: string,
  headers: Record<string, string>,
  success?: ISizeSuccess,
  failure?: ISizeFailure,
): Promise<IImageSize> | undefined {
  const promise = sizeOf(() =>
    requireLoader('getSizeWithHeaders').getSizeWithHeaders(uri, headers),
  );
  return deliverSize(promise, uri, success, failure);
}

const ANDROID_OS = 'android';

// Android keys an in-flight prefetch by a monotonic `requestId` so `abortRequest` can cancel it
let prefetchRequestId = 0;

// Resolves to whether native fetched it, `callback` gets the `requestId` for `abortPrefetch`
async function prefetch(
  uri: string,
  callback?: (requestId: number) => void,
): Promise<boolean> {
  prefetchRequestId += 1;
  const requestId = prefetchRequestId;
  if (typeof callback === 'function') callback(requestId);
  try {
    const loader = requireLoader('prefetch');
    // iOS takes only the uri, an extra arg throws in the bridgeless TurboModule
    const result =
      Platform.OS === ANDROID_OS
        ? await loader.prefetchImage(uri, requestId)
        : await loader.prefetchImage(uri);
    return result === true;
  } catch (error: unknown) {
    dlog(`Image.prefetch failed for ${uri}: ${String(error)}`);
    throw error;
  }
}

// iOS hands native the query root and a root tag (0 when absent), Android is plain `prefetch`
async function prefetchWithMetadata(
  uri: string,
  queryRootName: string,
  rootTag?: number,
  callback?: (requestId: number) => void,
): Promise<boolean> {
  const loader = requireLoader('prefetchWithMetadata');
  const withMetadata = loader.prefetchImageWithMetadata;
  if (Platform.OS === ANDROID_OS || withMetadata === undefined) {
    return prefetch(uri, callback);
  }
  const result = await withMetadata.call(
    loader,
    uri,
    queryRootName,
    rootTag ?? 0,
  );
  return result === true;
}

// Cancels an in-flight prefetch by its `requestId`, Android only
// A missing `abortRequest` (iOS, headless) is a no-op rather than a throw
function abortPrefetch(requestId: number): void {
  const loader = getImageLoader();
  if (loader === null || typeof loader.abortRequest !== 'function') {
    dlog(
      `Image.abortPrefetch(${requestId}): no abortRequest on this host, ignoring`,
    );
    return;
  }
  loader.abortRequest(requestId);
}

// Native answers an object mapping each known uri to its cache status
// Unknown statuses are dropped rather than trusted
const CACHE_STATUS: Record<string, IImageCacheStatus> = {
  memory: 'memory',
  disk: 'disk',
  'disk/memory': 'disk/memory',
};

function toCacheRecord(result: unknown): Record<string, IImageCacheStatus> {
  const record: Record<string, IImageCacheStatus> = {};
  if (typeof result !== 'object' || result === null) return record;
  for (const key of Object.keys(result)) {
    const value = Reflect.get(result, key);
    if (typeof value === 'string' && Object.hasOwn(CACHE_STATUS, value)) {
      record[key] = CACHE_STATUS[value];
    }
  }
  return record;
}

async function queryCache(
  uris: string[],
): Promise<Record<string, IImageCacheStatus>> {
  return Promise.resolve()
    .then(() => {
      const loader = requireLoader('queryCache');
      // Native `queryCache` never rejects, so a rejection is a boundary fault
      // The log tells "not a function" (interop gap) from a marshalling reject
      dlog(
        `Image.queryCache: typeof loader.queryCache=${typeof loader.queryCache} uris=${uris.length}`,
      );
      return loader.queryCache(uris);
    })
    .then(toCacheRecord)
    .catch((error: unknown) => {
      dlog(`Image.queryCache failed: ${String(error)}`);
      throw error;
    });
}

// Pure JS: runs the installed source resolver, injected by the app with `setImageSourceResolver`
function resolveAssetSource(source: IImageSourceProp): unknown {
  return resolveImageSource(source);
}

export type IImageStatics = {
  getSize: typeof getSize;
  getSizeWithHeaders: typeof getSizeWithHeaders;
  prefetch: typeof prefetch;
  prefetchWithMetadata: typeof prefetchWithMetadata;
  abortPrefetch: typeof abortPrefetch;
  queryCache: typeof queryCache;
  resolveAssetSource: typeof resolveAssetSource;
};

export const imageStatics: IImageStatics = {
  getSize,
  getSizeWithHeaders,
  prefetch,
  prefetchWithMetadata,
  abortPrefetch,
  queryCache,
  resolveAssetSource,
};
