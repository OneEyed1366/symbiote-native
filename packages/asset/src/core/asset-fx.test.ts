// Ported behavior of expo-asset/src/Asset.fx.ts (sdk-57) — registers a custom RN Image source
// transformer only in a classic-updates/Expo-Go env; each scenario resets modules to reimport
// with a fresh IS_ENV_WITH_LOCAL_ASSETS snapshot (computed once at module load).
import { afterEach, describe, expect, it, vi } from 'vitest';

const setCustomSourceTransformer = vi.fn();
vi.mock('react-native/Libraries/Image/resolveAssetSource', () => ({
  default: { setCustomSourceTransformer },
}));

const fromMetadata = vi.fn();
vi.mock('./asset', () => ({
  Asset: { fromMetadata },
  ANDROID_EMBEDDED_URL_BASE_RESOURCE: 'file:///android_res/',
}));

function mockPlatformUtils(isEnvWithLocalAssets: boolean): void {
  vi.doMock('./platform-utils', () => ({
    IS_ENV_WITH_LOCAL_ASSETS: isEnvWithLocalAssets,
  }));
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('registration (Positive)', () => {
  it('never registers a transformer in a bare app', async () => {
    mockPlatformUtils(false);
    await import('./asset-fx');

    expect(setCustomSourceTransformer).not.toHaveBeenCalled();
  });

  it('registers a transformer in a classic-updates/Expo-Go env', async () => {
    mockPlatformUtils(true);
    await import('./asset-fx');

    expect(setCustomSourceTransformer).toHaveBeenCalledTimes(1);
    expect(setCustomSourceTransformer).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });
});

describe('the registered transformer (Positive)', () => {
  async function getTransformer() {
    mockPlatformUtils(true);
    await import('./asset-fx');
    return setCustomSourceTransformer.mock.calls[0][0];
  }

  it('falls back to defaultAsset() when the resolver has no fileHashes', async () => {
    const transformer = await getTransformer();
    const resolver = {
      asset: {},
      defaultAsset: vi.fn(() => 'DEFAULT'),
    };

    expect(transformer(resolver)).toBe('DEFAULT');
  });

  it('resolves via fromSource with the downloaded localUri when available', async () => {
    fromMetadata.mockReturnValueOnce({
      uri: 'https://example.com/a.png',
      downloaded: true,
      localUri: 'file:///cache/a.png',
    });
    const transformer = await getTransformer();
    const resolver = {
      asset: { fileHashes: ['abc'] },
      fromSource: vi.fn((source: string) => `SOURCE:${source}`),
    };

    expect(transformer(resolver)).toBe('SOURCE:file:///cache/a.png');
    expect(resolver.fromSource).toHaveBeenCalledWith('file:///cache/a.png');
  });

  it('resolves via fromSource with the remote uri when not yet downloaded', async () => {
    fromMetadata.mockReturnValueOnce({
      uri: 'https://example.com/a.png',
      downloaded: false,
      localUri: null,
    });
    const transformer = await getTransformer();
    const resolver = {
      asset: { fileHashes: ['abc'] },
      fromSource: vi.fn((source: string) => `SOURCE:${source}`),
    };

    expect(transformer(resolver)).toBe('SOURCE:https://example.com/a.png');
  });

  it('uses resourceIdentifierWithoutScale() for an android_res embedded asset', async () => {
    fromMetadata.mockReturnValueOnce({
      uri: 'file:///android_res/drawable/test.png',
      downloaded: true,
      localUri: null,
    });
    const transformer = await getTransformer();
    const resolver = {
      asset: { fileHashes: ['abc'] },
      resourceIdentifierWithoutScale: vi.fn(() => 'RESOURCE_ID'),
    };

    expect(transformer(resolver)).toBe('RESOURCE_ID');
  });
});

describe('the registered transformer (Negative — swallows any throw)', () => {
  it('falls back to defaultAsset() when Asset.fromMetadata throws', async () => {
    fromMetadata.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const transformer = await (async () => {
      mockPlatformUtils(true);
      await import('./asset-fx');
      return setCustomSourceTransformer.mock.calls[0][0];
    })();
    const resolver = {
      asset: { fileHashes: ['abc'] },
      defaultAsset: vi.fn(() => 'DEFAULT'),
    };

    expect(transformer(resolver)).toBe('DEFAULT');
  });
});
