// Unit test for the Image statics imperative module (getSize / getSizeWithHeaders / prefetch /
// abortPrefetch / queryCache / resolveAssetSource), extracted out of the VIEW layer's
// render-image.ts into this native-bridge-touching module (same shape as alert.test.ts / the
// Share test - a fake ImageLoader installed via __turboModuleProxy, the same global
// getNativeModule reads). Platform is mocked directly to control the iOS/Android prefetch-call
// branch without depending on a real PlatformConstants native module.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./platform', () => ({ Platform: { OS: 'ios' } }));

let imageStatics: typeof import('./image-loader').imageStatics;
let setImageSourceResolver: typeof import('./image-source-resolver').setImageSourceResolver;

type ICapturedGetSize = { uri: string };
type ICapturedGetSizeWithHeaders = { uri: string; headers: Record<string, string> };
type ICapturedPrefetch = { uri: string; requestId?: number };

let capturedGetSize: ICapturedGetSize | null;
let capturedGetSizeWithHeaders: ICapturedGetSizeWithHeaders | null;
let capturedPrefetch: ICapturedPrefetch | null;
let capturedAbortId: number | null;
let capturedQueryCacheUris: string[] | null;

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

// A configurable fake, so a Negative scenario can swap in a rejecting/malformed native reply
// without duplicating the whole beforeEach setup per test.
type IFakeImageLoader = {
  getSize(uri: string): Promise<unknown>;
  getSizeWithHeaders(uri: string, headers: Record<string, string>): Promise<unknown>;
  prefetchImage(uri: string, requestId?: number): Promise<unknown>;
  abortRequest?(requestId: number): void;
  queryCache(uris: string[]): Promise<unknown>;
};

function installFakeImageLoader(loader: IFakeImageLoader | null): void {
  globalThis.__turboModuleProxy = <T>(name: string): T | null =>
    name === 'ImageLoader' && loader !== null && isPresent<T>(loader) ? loader : null;
}

function defaultFakeImageLoader(): IFakeImageLoader {
  return {
    getSize(uri: string): Promise<[number, number]> {
      capturedGetSize = { uri };
      return Promise.resolve([100, 200]);
    },
    getSizeWithHeaders(uri: string, headers: Record<string, string>): Promise<unknown> {
      capturedGetSizeWithHeaders = { uri, headers };
      return Promise.resolve({ width: 300, height: 400 });
    },
    prefetchImage(uri: string, requestId?: number): Promise<boolean> {
      capturedPrefetch = { uri, requestId };
      return Promise.resolve(true);
    },
    abortRequest(requestId: number): void {
      capturedAbortId = requestId;
    },
    queryCache(uris: string[]): Promise<Record<string, string>> {
      capturedQueryCacheUris = uris;
      return Promise.resolve({ 'https://a': 'memory', 'https://b': 'bogus' });
    },
  };
}

beforeEach(async () => {
  capturedGetSize = null;
  capturedGetSizeWithHeaders = null;
  capturedPrefetch = null;
  capturedAbortId = null;
  capturedQueryCacheUris = null;

  installFakeImageLoader(defaultFakeImageLoader());

  vi.resetModules();
  ({ imageStatics } = await import('./image-loader'));
  ({ setImageSourceResolver } = await import('./image-source-resolver'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

describe('imageStatics', () => {
  describe('Positive', () => {
    it('getSize resolves width/height from the native [width, height] array', async () => {
      const size = await imageStatics.getSize('https://example.com/a.png');
      expect(size).toEqual({ width: 100, height: 200 });
      expect(capturedGetSize?.uri).toBe('https://example.com/a.png');
    });

    it('getSize also invokes the success callback', async () => {
      let seen: [number, number] | null = null;
      await imageStatics.getSize('https://example.com/a.png', (w, h) => {
        seen = [w, h];
      });
      expect(seen).toEqual([100, 200]);
    });

    // why: the iOS spec resolves a {width, height} OBJECT for this call (unlike getSize's array),
    // so toImageSize must accept both shapes without the caller branching on which method it was.
    it('getSizeWithHeaders resolves width/height from the native {width, height} object', async () => {
      const size = await imageStatics.getSizeWithHeaders('https://example.com/b.png', {
        Authorization: 'x',
      });
      expect(size).toEqual({ width: 300, height: 400 });
      expect(capturedGetSizeWithHeaders?.headers).toEqual({ Authorization: 'x' });
    });

    it('prefetch resolves true and reports a monotonic requestId via the callback', async () => {
      let reportedId: number | null = null;
      const ok = await imageStatics.prefetch('https://example.com/c.png', id => {
        reportedId = id;
      });
      expect(ok).toBe(true);
      expect(reportedId).toBe(1);
      // iOS: prefetchImage is called with only the uri (no requestId arg forwarded to native).
      expect(capturedPrefetch?.requestId).toBeUndefined();
    });

    // why: abortPrefetch keys off the id prefetch handed back; two overlapping prefetches must
    // never collide on the same id, or abortPrefetch(idA) could cancel request B instead.
    it('prefetch requestId keeps increasing across calls, never repeats', async () => {
      const ids: number[] = [];
      await imageStatics.prefetch('https://example.com/c1.png', id => ids.push(id));
      await imageStatics.prefetch('https://example.com/c2.png', id => ids.push(id));
      expect(ids).toEqual([1, 2]);
    });

    it('abortPrefetch forwards the requestId to native abortRequest', () => {
      imageStatics.abortPrefetch(7);
      expect(capturedAbortId).toBe(7);
    });

    // why: Android's spec only (NativeImageLoaderAndroid.js) exposes abortRequest; iOS/headless
    // callers still call abortPrefetch (e.g. an unmounted <Image>'s cleanup), so a missing native
    // method must be a no-op, never a thrown "not a function".
    it('abortPrefetch is a no-op when the native loader has no abortRequest (e.g. iOS)', () => {
      installFakeImageLoader({
        ...defaultFakeImageLoader(),
        abortRequest: undefined,
      });
      expect(() => imageStatics.abortPrefetch(7)).not.toThrow();
      expect(capturedAbortId).toBeNull();
    });

    it('queryCache narrows the result to known cache statuses, dropping unknown ones', async () => {
      const record = await imageStatics.queryCache(['https://a', 'https://b']);
      expect(record).toEqual({ 'https://a': 'memory' });
      expect(capturedQueryCacheUris).toEqual(['https://a', 'https://b']);
    });

    it('resolveAssetSource runs the currently-installed source resolver', () => {
      setImageSourceResolver(source => ({ uri: `resolved:${String(source)}` }));
      expect(imageStatics.resolveAssetSource(42)).toEqual({ uri: 'resolved:42' });
    });

    it('resolveAssetSource is the identity when no resolver has been installed', () => {
      expect(imageStatics.resolveAssetSource(42)).toBe(42);
    });
  });

  describe('Negative', () => {
    // why: getSize/getSizeWithHeaders/prefetch/queryCache all call requireLoader() first, which
    // must fail loud (not silently resolve undefined) when running headless or on a host that
    // never linked the ImageLoader native module — a swallowed failure here would hang callers.
    it('getSize rejects when the ImageLoader native module is not available', async () => {
      installFakeImageLoader(null);
      await expect(imageStatics.getSize('https://example.com/a.png')).rejects.toThrow(
        'Image.getSize: ImageLoader native module is not available',
      );
    });

    // why: toImageSize only accepts a [w, h] array or a {width, height} object; any other shape
    // is an unmarshalled boundary fault that must surface as a real error, not silently coerce
    // into NaN dimensions.
    it('getSize rejects when native resolves an unrecognized shape', async () => {
      installFakeImageLoader({
        ...defaultFakeImageLoader(),
        getSize: () => Promise.resolve('not-a-size'),
      });
      await expect(imageStatics.getSize('https://example.com/a.png')).rejects.toThrow(
        'unexpected size result from native',
      );
    });

    // why: getSize offers BOTH a callback and a Promise return value (a superset of RN's
    // callback-only shape) — a caller using only the failure callback must not have the
    // rejection silently swallowed by the callback branch's own .catch().
    it('getSize still rejects its returned promise even when a failure callback is provided', async () => {
      installFakeImageLoader({
        ...defaultFakeImageLoader(),
        getSize: () => Promise.reject(new Error('native getSize failed')),
      });
      let failureSeen: unknown;
      const promise = imageStatics.getSize(
        'https://example.com/a.png',
        () => undefined,
        error => {
          failureSeen = error;
        },
      );
      await expect(promise).rejects.toThrow('native getSize failed');
      expect(failureSeen).toBeInstanceOf(Error);
    });

    it('prefetch rejects when native prefetchImage rejects', async () => {
      installFakeImageLoader({
        ...defaultFakeImageLoader(),
        prefetchImage: () => Promise.reject(new Error('network down')),
      });
      await expect(imageStatics.prefetch('https://example.com/c.png')).rejects.toThrow(
        'network down',
      );
    });

    it('queryCache rejects when native queryCache rejects', async () => {
      installFakeImageLoader({
        ...defaultFakeImageLoader(),
        queryCache: () => Promise.reject(new Error('cache lookup failed')),
      });
      await expect(imageStatics.queryCache(['https://a'])).rejects.toThrow('cache lookup failed');
    });
  });
});

describe('imageStatics on Android', () => {
  beforeEach(async () => {
    vi.doMock('./platform', () => ({ Platform: { OS: 'android' } }));
    vi.resetModules();
    ({ imageStatics } = await import('./image-loader'));
  });

  // why: NativeImageLoaderAndroid's prefetchImage takes a second requestId arg so
  // abortRequest can key off it; NativeImageLoaderIOS throws on that extra arg, so the two
  // platforms must diverge on this exact call shape (see the iOS "no requestId forwarded" case).
  it('prefetch forwards the requestId to native prefetchImage', async () => {
    await imageStatics.prefetch('https://example.com/d.png');
    expect(capturedPrefetch?.requestId).toBe(1);
  });
});
