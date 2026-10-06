import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  loadAsync: vi.fn(async () => ({ width: 1 })),
  prefetch: vi.fn(async () => true),
  clearMemoryCache: vi.fn(async () => true),
  clearDiskCache: vi.fn(async () => false),
  configureCache: vi.fn(),
  getCachePathAsync: vi.fn(async () => '/cache/a'),
  writeToCacheAsync: vi.fn(async () => undefined),
  readFromCacheAsync: vi.fn(async () => null),
  generateBlurhashAsync: vi.fn(async () => 'hash'),
  generateThumbhashAsync: vi.fn(async () => 'thumb'),
}));

vi.mock('./native-module', () => ({ expoImage: native }));
vi.mock('@symbiote-native/engine', () => ({
  processColor: (color: string) => `processed:${color}`,
  resolveAssetSource: () => null,
}));
vi.mock('expo-modules-core', () => ({ SharedRef: class {} }));

const api = await import('./image-api');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('prefetchImages', () => {
  it('prefetches into memory and disk by default and wraps one url in a list', async () => {
    await api.prefetchImages('https://x/a.png');

    expect(native.prefetch).toHaveBeenCalledWith(
      ['https://x/a.png'],
      'memory-disk',
      undefined,
    );
  });

  it('takes a cache policy string', async () => {
    await api.prefetchImages(['a', 'b'], 'disk');

    expect(native.prefetch).toHaveBeenCalledWith(['a', 'b'], 'disk', undefined);
  });

  it('takes an options object with headers', async () => {
    await api.prefetchImages('a', {
      cachePolicy: 'memory',
      headers: { k: 'v' },
    });

    expect(native.prefetch).toHaveBeenCalledWith(['a'], 'memory', { k: 'v' });
  });

  it('answers what native answers', async () => {
    expect(await api.prefetchImages('a')).toBe(true);
  });
});

describe('cache functions', () => {
  it('forward to the native module', async () => {
    expect(await api.clearMemoryCache()).toBe(true);
    expect(await api.clearDiskCache()).toBe(false);
    expect(await api.getCachePathAsync('k')).toBe('/cache/a');
    expect(await api.readFromCacheAsync('k')).toBeNull();
    await api.writeToCacheAsync('u', 'k');
    api.configureCache({ maxDiskSize: 10 });

    expect(native.writeToCacheAsync).toHaveBeenCalledWith('u', 'k');
    expect(native.configureCache).toHaveBeenCalledWith({ maxDiskSize: 10 });
  });
});

describe('hash generation', () => {
  it('forwards the source and the components', async () => {
    expect(await api.generateBlurhashAsync('u', [4, 3])).toBe('hash');
    expect(await api.generateThumbhashAsync('u')).toBe('thumb');

    expect(native.generateBlurhashAsync).toHaveBeenCalledWith('u', [4, 3]);
  });
});

describe('loadImageAsync', () => {
  it('resolves the source and leaves the error callback out', async () => {
    await api.loadImageAsync('https://x/a.png', {
      maxWidth: 10,
      onError: () => undefined,
    });

    expect(native.loadAsync).toHaveBeenCalledWith(
      { uri: 'https://x/a.png' },
      { maxWidth: 10, maxHeight: undefined, tintColor: undefined },
    );
  });

  it('processes the tint color for native', async () => {
    await api.loadImageAsync('a', { tintColor: '#ff0000' });

    expect(native.loadAsync).toHaveBeenCalledWith(
      { uri: 'a' },
      expect.objectContaining({ tintColor: 'processed:#ff0000' }),
    );
  });

  it('rejects an asset the bundler cannot resolve', async () => {
    await expect(api.loadImageAsync(5)).rejects.toThrow(
      'could not be resolved',
    );
  });
});
