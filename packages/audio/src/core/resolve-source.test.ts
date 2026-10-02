import { afterEach, describe, expect, it, vi } from 'vitest';

const fromURI = vi.fn();
const fromModule = vi.fn();
class FakeAsset {
  name = '';
  uri = '';
  localUri: string | null = null;
  downloadAsync = vi.fn(async () => {
    this.localUri = 'file:///cache/asset.mp3';
  });
}
vi.mock('@symbiote-native/asset', () => ({
  Asset: Object.assign(FakeAsset, { fromURI, fromModule }),
}));

const { resolveSource, resolveSources, resolveSourceWithDownload } =
  await import('./resolve-source');

afterEach(() => {
  vi.clearAllMocks();
});

describe('resolveSource', () => {
  it('returns null for null/undefined', () => {
    expect(resolveSource(null)).toBeNull();
    expect(resolveSource(undefined)).toBeNull();
  });

  it('wraps a bare string into a { uri } object', () => {
    expect(resolveSource('https://example.com/track.mp3')).toEqual({
      uri: 'https://example.com/track.mp3',
    });
  });

  it('passes an object source with no assetId through unchanged', () => {
    const source = { uri: 'https://example.com/track.mp3', name: 'Track' };
    expect(resolveSource(source)).toBe(source);
  });

  it("resolves a number (require()'d asset) via Asset.fromModule", () => {
    const asset = new FakeAsset();
    asset.uri = 'file:///bundled/track.mp3';
    asset.name = 'Track';
    fromModule.mockReturnValueOnce(asset);

    expect(resolveSource(42)).toEqual({
      uri: 'file:///bundled/track.mp3',
      name: 'Track',
      assetId: 42,
    });
    expect(fromModule).toHaveBeenCalledWith(42);
  });

  it('prefers a downloaded localUri over the bundled uri', () => {
    const asset = new FakeAsset();
    asset.uri = 'file:///bundled/track.mp3';
    asset.localUri = 'file:///cache/track.mp3';
    fromModule.mockReturnValueOnce(asset);

    expect(resolveSource(42)).toEqual({
      uri: 'file:///cache/track.mp3',
      assetId: 42,
    });
  });

  it('resolves an Asset instance directly', () => {
    const asset = new FakeAsset();
    asset.uri = 'file:///bundled/track.mp3';
    expect(resolveSource(asset)).toEqual({
      uri: 'file:///bundled/track.mp3',
    });
  });

  it('resolves an object carrying assetId, overriding uri from the asset', () => {
    const asset = new FakeAsset();
    asset.uri = 'file:///bundled/track.mp3';
    fromModule.mockReturnValueOnce(asset);

    expect(resolveSource({ assetId: 7, name: 'Track' })).toEqual({
      assetId: 7,
      name: 'Track',
      uri: 'file:///bundled/track.mp3',
    });
    expect(fromModule).toHaveBeenCalledWith(7);
  });
});

describe('resolveSources', () => {
  it('resolves each source and drops null entries', () => {
    expect(resolveSources(['a.mp3', null, { uri: 'b.mp3' }])).toEqual([
      { uri: 'a.mp3' },
      { uri: 'b.mp3' },
    ]);
  });
});

describe('resolveSourceWithDownload', () => {
  it('downloads the asset and returns its local uri', async () => {
    const asset = new FakeAsset();
    asset.uri = 'https://example.com/track.mp3';
    fromURI.mockReturnValueOnce(asset);

    await expect(
      resolveSourceWithDownload('https://example.com/track.mp3'),
    ).resolves.toEqual({ uri: 'file:///cache/asset.mp3' });
    expect(asset.downloadAsync).toHaveBeenCalledTimes(1);
  });

  it('falls back to the plain resolved source when download fails', async () => {
    const asset = new FakeAsset();
    asset.uri = 'https://example.com/track.mp3';
    asset.downloadAsync = vi.fn(async () => {
      throw new Error('network down');
    });
    fromURI.mockReturnValueOnce(asset);

    await expect(
      resolveSourceWithDownload('https://example.com/track.mp3'),
    ).resolves.toEqual({ uri: 'https://example.com/track.mp3' });
  });

  it('returns null for a null source, no Asset lookup attempted', async () => {
    await expect(resolveSourceWithDownload(null)).resolves.toBeNull();
    expect(fromURI).not.toHaveBeenCalled();
    expect(fromModule).not.toHaveBeenCalled();
  });
});
