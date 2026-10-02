// New coverage for this port's font-loader.ts (upstream expo-font ships no dedicated
// FontLoader test) — dispatch logic for getAssetForSource and the guard/error paths of
// loadSingleFontAsync.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-modules-core', () => ({
  CodedError: class CodedError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

const fromURI = vi.fn();
const fromModule = vi.fn();
class FakeAsset {
  downloaded = false;
  localUri: string | null = null;
  downloadAsync = vi.fn(async () => {
    this.downloaded = true;
    this.localUri = 'file:///cache/font.ttf';
  });
}
vi.mock('@symbiote-native/asset', () => ({
  Asset: Object.assign(FakeAsset, { fromURI, fromModule }),
}));

const loadAsync = vi.fn(async () => {});
vi.mock('./native-modules', () => ({ expoFontLoader: { loadAsync } }));

const { getAssetForSource, loadSingleFontAsync } =
  await import('./font-loader');

afterEach(() => {
  vi.clearAllMocks();
});

describe('getAssetForSource (Positive)', () => {
  it('resolves a string source through Asset.fromURI', () => {
    fromURI.mockReturnValueOnce('uri-asset');
    expect(getAssetForSource('https://example.com/font.ttf')).toBe('uri-asset');
    expect(fromURI).toHaveBeenCalledWith('https://example.com/font.ttf');
  });

  it('resolves a require() module id through Asset.fromModule', () => {
    fromModule.mockReturnValueOnce('module-asset');
    expect(getAssetForSource(42)).toBe('module-asset');
    expect(fromModule).toHaveBeenCalledWith(42);
  });

  it('returns an Asset instance unchanged', () => {
    const asset = new FakeAsset();
    expect(getAssetForSource(asset)).toBe(asset);
  });

  it('recurses on a FontResource object carrying a uri field', () => {
    fromURI.mockReturnValueOnce('resource-asset');
    expect(getAssetForSource({ uri: 'https://example.com/font.ttf' })).toBe(
      'resource-asset',
    );
    expect(fromURI).toHaveBeenCalledWith('https://example.com/font.ttf');
  });
});

describe('loadSingleFontAsync (Positive)', () => {
  it('downloads the asset then calls the native loader with its localUri', async () => {
    const asset = new FakeAsset();

    await loadSingleFontAsync('test-font', asset);

    expect(asset.downloadAsync).toHaveBeenCalledTimes(1);
    expect(loadAsync).toHaveBeenCalledWith(
      'test-font',
      'file:///cache/font.ttf',
    );
  });
});

describe('loadSingleFontAsync (Negative)', () => {
  it('rejects a non-Asset input with ERR_FONT_SOURCE', async () => {
    await expect(
      loadSingleFontAsync('test-font', { uri: 'x' }),
    ).rejects.toThrow(/expected a resource of type `Asset`/);
    expect(loadAsync).not.toHaveBeenCalled();
  });

  it('rejects with ERR_DOWNLOAD when the asset fails to actually download', async () => {
    const asset = new FakeAsset();
    asset.downloadAsync = vi.fn(async () => {});

    await expect(loadSingleFontAsync('test-font', asset)).rejects.toThrow(
      'Failed to download asset for font "test-font"',
    );
    expect(loadAsync).not.toHaveBeenCalled();
  });
});
