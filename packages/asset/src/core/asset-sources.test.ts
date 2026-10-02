// Ported from expo-asset/src/__tests__/AssetSources-test.ts (sdk-57), native-only (drops the
// web Platform.select arm). Manifest2/experienceUrl cases mock expo-constants per test and
// reset modules to reimport, since platform-utils.ts snapshots Constants once at module load.
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockPlatform = { OS: 'ios' as 'ios' | 'android' };
vi.mock('expo-modules-core', () => ({
  Platform: mockPlatform,
  requireNativeModule: () => {
    throw new Error('ExpoGo native module not present');
  },
  requireOptionalNativeModule: () => undefined,
}));

const mockPixelRatio = { get: vi.fn(() => 2) };
vi.mock('react-native', () => ({
  PixelRatio: mockPixelRatio,
  NativeModules: {},
}));

vi.mock('react-native/Libraries/Image/AssetSourceResolver', () => ({
  default: {
    pickScale(scales: number[], deviceScale: number): number {
      const sorted = [...scales].sort((a, b) => a - b);
      return (
        sorted.find(s => s >= deviceScale) ?? sorted[sorted.length - 1] ?? 1
      );
    },
  },
}));

function mockConstants(constants: {
  experienceUrl?: string;
  __unsafeNoWarnManifest2?: unknown;
}): void {
  vi.doMock('expo-constants', () => ({ default: constants }));
}

const FONT_METADATA = {
  hash: 'cafecafecafecafecafecafecafecafe',
  name: 'test',
  type: 'ttf',
  scales: [1],
  httpServerLocation: '/assets',
};

describe('selectAssetSource (Positive)', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('returns an empty-uri fallback when metadata has no absolute URL', async () => {
    mockConstants({});
    const { selectAssetSource } = await import('./asset-sources');

    expect(selectAssetSource(FONT_METADATA)).toEqual({
      hash: 'cafecafecafecafecafecafecafecafe',
      uri: '',
    });
  });

  it('returns a manifest2 dev-server URI over http:// when experienceUrl uses http://', async () => {
    mockConstants({
      experienceUrl: 'http://127.0.0.1:8081/app',
      __unsafeNoWarnManifest2: {
        extra: { expoGo: { developer: {}, debuggerHost: '127.0.0.1:8081' } },
      },
    });
    const { selectAssetSource } = await import('./asset-sources');

    const source = selectAssetSource(FONT_METADATA);
    expect(source.uri).toBe(
      'http://127.0.0.1:8081/assets/test.ttf?platform=ios&hash=cafecafecafecafecafecafecafecafe',
    );
    expect(source.hash).toBe('cafecafecafecafecafecafecafecafe');
  });

  it('returns a manifest2 dev-server URI over https:// when experienceUrl uses exps://', async () => {
    mockConstants({
      experienceUrl: 'exps://example.com/app',
      __unsafeNoWarnManifest2: {
        extra: { expoGo: { developer: {}, debuggerHost: 'example.com:8081' } },
      },
    });
    const { selectAssetSource } = await import('./asset-sources');

    const source = selectAssetSource(FONT_METADATA);
    expect(source.uri).toBe(
      'https://example.com:8081/assets/test.ttf?platform=ios&hash=cafecafecafecafecafecafecafecafe',
    );
  });

  it('returns a file URI from the metadata when fileUris is specified', async () => {
    mockConstants({});
    const { selectAssetSource } = await import('./asset-sources');

    const source = selectAssetSource({
      ...FONT_METADATA,
      fileUris: ['https://example.com/example.ttf'],
    });
    expect(source).toEqual({
      uri: 'https://example.com/example.ttf',
      hash: 'cafecafecafecafecafecafecafecafe',
    });
  });

  it('returns a URI based on an absolute httpServerLocation', async () => {
    mockConstants({});
    const { selectAssetSource } = await import('./asset-sources');

    const source = selectAssetSource({
      ...FONT_METADATA,
      httpServerLocation: 'https://example.com',
    });
    expect(source.uri).toBe(
      'https://example.com/test.ttf?platform=ios&hash=cafecafecafecafecafecafecafecafe',
    );
    expect(source.hash).toBe('cafecafecafecafecafecafecafecafe');
  });

  it('chooses the file matching the best scale for the device pixel ratio', async () => {
    mockConstants({});
    const { selectAssetSource } = await import('./asset-sources');

    const source = selectAssetSource({
      hash: 'cafecafecafecafecafecafecafecafe',
      name: 'test',
      type: 'png',
      scales: [1, 2, 100],
      fileUris: [
        'https://example.com/icon.png',
        'https://example.com/icon@2x.png',
        'https://example.com/icon@100x.png',
      ],
      fileHashes: [
        'facefacefacefacefacefacefaceface',
        'c0dec0dec0dec0dec0dec0dec0dec0de',
        'babebabebabebabebabebabebabebabe',
      ],
      httpServerLocation: '/assets',
    });

    expect(source.uri).toBe('https://example.com/icon@2x.png');
    expect(source.hash).toBe('c0dec0dec0dec0dec0dec0dec0dec0de');
  });
});

describe('resolveUri (Positive)', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('returns a URL as-is when there is no manifest base URL', async () => {
    mockConstants({});
    const { resolveUri } = await import('./asset-sources');

    expect(resolveUri('./icon.png')).toBe('./icon.png');
  });

  it('returns an absolute URL as-is even with a manifest base URL present', async () => {
    mockConstants({
      experienceUrl: 'https://example.com/app/expo-manifest.json',
    });
    const { resolveUri } = await import('./asset-sources');

    expect(resolveUri('https://example.com/icon.png?q=1#hash')).toBe(
      'https://example.com/icon.png?q=1#hash',
    );
  });

  it("resolves a relative URL against the manifest's base URL", async () => {
    mockConstants({ experienceUrl: 'https://expo.io/@user/app/index.exp' });
    const { resolveUri } = await import('./asset-sources');

    expect(resolveUri('./icon.png')).toBe('https://expo.io/@user/app/icon.png');
  });

  it('resolves . and .. segments relative to the manifest base URL', async () => {
    mockConstants({
      experienceUrl: 'https://example.com/app/expo-manifest.json',
    });
    const { resolveUri } = await import('./asset-sources');

    expect(resolveUri('.././test/../icon.png')).toBe(
      'https://example.com/icon.png',
    );
  });
});
