// Image static methods (RN's Image.getSize/prefetch/queryCache/etc). Both iOS and Android specs
// register under the same module name ('ImageLoader'), so this stays flat, non-platform-split —
// only the Android prefetch call signature differs (a second requestId arg), branched below.

// The native result crosses the I/O boundary as unknown; we never cast it, we narrow its shape.
// This is a stateful, native-bridge-touching imperative module with no view of its own — it
// belongs here alongside Alert/Share, not in a view/render-*.ts file.

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

// The ImageLoader native module surface we consume. One name, two signatures: Android's
// prefetchImage takes a second requestId arg (abortRequest keys off it), iOS takes only uri and
// throws on the extra arg, so the call below branches on Platform.OS.
type INativeImageLoader = {
  getSize(uri: string): Promise<unknown>;
  getSizeWithHeaders(
    uri: string,
    headers: Record<string, string>,
  ): Promise<unknown>;
  // The arg is optional so the iOS call passes exactly one — a second arg makes the bridgeless
  // TurboModule throw "Exception in HostFunction".
  prefetchImage(uri: string, requestId?: number): Promise<unknown>;
  abortRequest?(requestId: number): void;
  queryCache(uris: string[]): Promise<unknown>;
};

// The native module name RN registers this under. A module name like this is only provable on a
// real host — a headless fake answers to any name.
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

// Narrow native's getSize result. The spec resolves a `[width, height]` array, but tolerate a
// `{width, height}` object too (getSizeWithHeaders uses that shape).
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

// Image.ios.js / Image.android.js: the promise when no success callback is given; otherwise the
// result goes to the callbacks and nothing is returned, a missing `failure` becoming a warning.
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

// Overloaded as RN types it: the promise without callbacks, nothing with them.
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
  const promise = Promise.resolve()
    .then(() => requireLoader('getSize').getSize(uri))
    .then(toImageSize);
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
  const promise = Promise.resolve()
    .then(() =>
      requireLoader('getSizeWithHeaders').getSizeWithHeaders(uri, headers),
    )
    .then(toImageSize);
  return deliverSize(promise, uri, success, failure);
}

// Android keys an in-flight prefetch by a monotonic requestId (so abortRequest can cancel it);
// RN's Image.android.js generates the same way. iOS ignores the arg.
let prefetchRequestId = 0;

// Download a remote image into the disk cache. Resolves to whether it succeeded. `callback`
// receives the requestId (RN's Image.android.js shape) so the caller can later pass it to
// abortPrefetch.
async function prefetch(
  uri: string,
  callback?: (requestId: number) => void,
): Promise<boolean> {
  prefetchRequestId += 1;
  const requestId = prefetchRequestId;
  if (typeof callback === 'function') callback(requestId);
  const loader = requireLoader('prefetch');
  return (
    Promise.resolve()
      // Android's prefetchImage keys an abortable request on requestId; iOS takes ONLY the uri and
      // throws on an extra arg (bridgeless TurboModule arg-count check). Match RN's per-platform call.
      .then(() =>
        Platform.OS === 'android'
          ? loader.prefetchImage(uri, requestId)
          : loader.prefetchImage(uri),
      )
      .then(result => result === true)
      .catch((error: unknown) => {
        dlog(`Image.prefetch failed for ${uri}: ${String(error)}`);
        throw error;
      })
  );
}

// Cancel an in-flight prefetch by the requestId prefetch handed back. Android only (mirrors
// Image.android.js -> NativeImageLoaderAndroid.abortRequest); a missing abortRequest (iOS,
// headless) is a no-op rather than a throw.
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

// Narrow native's queryCache result: an object mapping each known uri to its cache status.
// Unknown statuses are dropped rather than trusted blindly.
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
      // The native queryCache never rejects (RCTImageLoader resolves getImageCacheStatus), so a
      // rejection here is a JS/native boundary fault: log whether the method is even callable and
      // the arg shape, to tell "not a function" (interop gap) from a marshalling reject.
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

// Pure JS: run the currently-installed source resolver (the same machinery the Image component
// uses via resolveImageSource). The app injects the real one with setImageSourceResolver.
function resolveAssetSource(source: IImageSourceProp): unknown {
  return resolveImageSource(source);
}

export type IImageStatics = {
  getSize: typeof getSize;
  getSizeWithHeaders: typeof getSizeWithHeaders;
  prefetch: typeof prefetch;
  abortPrefetch: typeof abortPrefetch;
  queryCache: typeof queryCache;
  resolveAssetSource: typeof resolveAssetSource;
};

export const imageStatics: IImageStatics = {
  getSize,
  getSizeWithHeaders,
  prefetch,
  abortPrefetch,
  queryCache,
  resolveAssetSource,
};
