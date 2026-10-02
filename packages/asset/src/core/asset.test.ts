// Ported from expo-asset/src/__tests__/Asset-test.ts (sdk-57), native-only subset — drops the
// web branch and the auto-registered source-transformer test (that's asset-fx.test.ts's job).
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockPlatform = { OS: 'ios' as 'ios' | 'android' };
const FAKE_LOCAL_ASSETS = {
  test1: 'file:///Expo.app/asset_test1.png',
  androidResTest1: 'file:///android_res/drawable/test.png',
};
vi.mock('expo-modules-core', () => ({
  Platform: mockPlatform,
  requireNativeModule: () => {
    throw new Error('ExpoGo native module not present');
  },
  requireOptionalNativeModule: (name: string) =>
    name === 'ExpoUpdates'
      ? { isEnabled: false, localAssets: FAKE_LOCAL_ASSETS }
      : undefined,
}));
vi.mock('expo-constants', () => ({
  default: { experienceUrl: undefined, __unsafeNoWarnManifest2: undefined },
}));

const downloadAsync = vi.fn(async () => 'file:///cache/ExponentAsset-cafe.png');
vi.mock('./native-module', () => ({ expoAsset: { downloadAsync } }));

const getAssetByID = vi.fn();
vi.mock('@react-native/assets-registry/registry', () => ({ getAssetByID }));

const resolveAssetSource = vi.fn();
vi.mock('react-native/Libraries/Image/resolveAssetSource', () => ({
  default: resolveAssetSource,
}));

// Asset.fromMetadata calls the real selectAssetSource (asset-sources.ts), which reads
// PixelRatio — stub bare 'react-native' so its real, Flow-typed entry never loads.
vi.mock('react-native', () => ({
  PixelRatio: { get: () => 2 },
  NativeModules: {},
}));
vi.mock('react-native/Libraries/Image/AssetSourceResolver', () => ({
  default: { pickScale: (scales: number[]) => scales[0] },
}));

const { Asset } = await import('./asset');

afterEach(() => {
  mockPlatform.OS = 'ios';
  vi.clearAllMocks();
});

describe('Asset.fromMetadata / Asset.fromURI (Positive)', () => {
  it('creates an asset from metadata, carrying its hash', () => {
    const asset = Asset.fromMetadata({
      name: 'test-meta-1',
      type: 'png',
      uri: 'https://example.com/icon.png',
      hash: 'cafecafecafecafecafecafecafecafe',
      scales: [1],
      httpServerLocation: '/assets',
      fileUris: ['https://example.com/icon.png'],
      fileHashes: ['cafecafecafecafecafecafecafecafe'],
    });
    expect(asset.hash).toBe('cafecafecafecafecafecafecafecafe');
  });

  it('interns assets by hash — the same metadata hash returns the same instance', () => {
    const meta = {
      name: 'test-meta-2',
      type: 'png',
      uri: 'https://example.com/icon2.png',
      hash: 'facefacefacefacefacefacefaceface',
      scales: [1],
      httpServerLocation: '/assets',
      fileUris: ['https://example.com/icon2.png'],
      fileHashes: ['facefacefacefacefacefacefaceface'],
    };
    expect(Asset.fromMetadata(meta)).toBe(Asset.fromMetadata(meta));
  });

  it('creates an asset from a plain URI', () => {
    const asset = Asset.fromURI('https://example.com/image-1.png');
    expect(asset.uri).toBe('https://example.com/image-1.png');
    expect(asset.type).toBe('png');
    expect(asset.hash).toBeNull();
  });

  it('extracts the MIME subtype as the type for a base64 data URI', () => {
    const asset = Asset.fromURI('data:text/html;base64,dGVzdA%3D%3D');
    expect(asset.type).toBe('html');
  });

  it('interns assets by URI — the same URI returns the same instance', () => {
    const uri = 'data:,Hello%2C%20World%21';
    expect(Asset.fromURI(uri)).toBe(Asset.fromURI(uri));
  });
});

describe('Asset.fromModule (Positive)', () => {
  it('resolves a require() module id through the RN asset registry', () => {
    getAssetByID.mockReturnValueOnce({
      name: 'test-module',
      type: 'ttf',
      hash: 'babebabebabebabebabebabebabebabe',
      width: null,
      height: null,
    });
    resolveAssetSource.mockReturnValueOnce({
      uri: 'https://example.com/font.ttf',
    });

    const asset = Asset.fromModule(1);
    expect(asset.hash).toBe('babebabebabebabebabebabebabebabe');
    expect(asset.uri).toBe('https://example.com/font.ttf');
  });

  it('marks an Android drawable-resource module as already downloaded', () => {
    mockPlatform.OS = 'android';
    getAssetByID.mockReturnValueOnce({
      name: 'test-drawable',
      type: 'png',
      hash: 'c0dec0dec0dec0dec0dec0dec0dec0de',
      width: 24,
      height: 24,
    });
    resolveAssetSource.mockReturnValueOnce({ uri: 'test_drawable' });

    const asset = Asset.fromModule(2);
    expect(asset.downloaded).toBe(true);
    expect(asset.localUri).toBe('test_drawable');
  });

  it('parses an inline { uri, width, height } object', () => {
    const asset = Asset.fromModule({
      uri: 'https://example.com/icon-3.png',
      width: 1,
      height: 1,
    });
    expect(asset.uri).toBe('https://example.com/icon-3.png');
    expect(asset.type).toBe('png');
  });
});

describe('Asset.fromModule (Negative — module missing from the asset registry)', () => {
  it('throws when the registry has no entry for the given module id', () => {
    getAssetByID.mockReturnValueOnce(undefined);
    expect(() => Asset.fromModule(999)).toThrow(
      /missing from the asset registry/,
    );
  });
});

describe('embedding (constructor resolves a locally-embedded asset by hash)', () => {
  it('considers an embedded asset already downloaded', () => {
    const asset = Asset.fromMetadata({
      name: 'test1',
      type: 'png',
      hash: 'test1',
      scales: [1],
      httpServerLocation: '/assets',
      fileHashes: ['test1'],
    });
    expect(asset.localUri).toBe('file:///Expo.app/asset_test1.png');
    expect(asset.downloaded).toBe(true);
  });

  it('treats file:///android_res/ assets as not-yet-downloaded, resolved via the uri itself', async () => {
    const asset = Asset.fromMetadata({
      name: 'androidResTest1',
      type: 'png',
      hash: 'androidResTest1',
      scales: [1],
      httpServerLocation: '/assets',
      fileHashes: ['androidResTest1'],
    });
    expect(asset.localUri).toBeNull();
    expect(asset.downloaded).toBeFalsy();
    expect(asset.uri).toBe('file:///android_res/drawable/test.png');

    await asset.downloadAsync();
    expect(downloadAsync).toHaveBeenCalledTimes(1);
    expect(asset.downloaded).toBe(true);
  });
});

describe('Asset.loadAsync (Positive — accepts module ids and URIs, single or array)', () => {
  it('loads a single require() module id and downloads it', async () => {
    getAssetByID.mockReturnValueOnce({
      name: 'test-load',
      type: 'png',
      hash: 'deadbeefdeadbeefdeadbeefdeadbeef',
      width: null,
      height: null,
    });
    resolveAssetSource.mockReturnValueOnce({
      uri: 'https://example.com/load.png',
    });

    const [asset] = await Asset.loadAsync(3);

    expect(asset.downloaded).toBe(true);
  });

  it('loads a single URI string and downloads it', async () => {
    const [asset] = await Asset.loadAsync('https://example.com/load-uri.png');

    expect(asset.uri).toBe('https://example.com/load-uri.png');
    expect(asset.downloaded).toBe(true);
  });

  it('loads an array of URI strings', async () => {
    const assets = await Asset.loadAsync([
      'https://example.com/load-a.png',
      'https://example.com/load-b.png',
    ]);

    expect(assets).toHaveLength(2);
    expect(assets.every(asset => asset.downloaded)).toBe(true);
  });
});

describe('Asset#downloadAsync (Positive)', () => {
  it('downloads an uncached asset through the native module', async () => {
    const asset = Asset.fromURI('https://example.com/download-1.png');
    expect(asset.localUri).toBeNull();

    await asset.downloadAsync();

    expect(asset.downloaded).toBe(true);
    expect(asset.localUri).toBe('file:///cache/ExponentAsset-cafe.png');
  });

  it('coalesces concurrent downloads of the same asset into one native call', async () => {
    const asset = Asset.fromURI('https://example.com/download-2.png');

    await Promise.all([asset.downloadAsync(), asset.downloadAsync()]);

    expect(downloadAsync).toHaveBeenCalledTimes(1);
  });
});
