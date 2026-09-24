// Ported from expo-font/src/__tests__/Font-test.native.ts (sdk-57) — the "in bare app" group
// plus the coalescing/caching cases from the upstream "within Expo Go" group, which upstream
// itself disables (xdescribe) but whose underlying memory.ts logic this port still exercises.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// expo-modules-core's real entry transitively imports 'react-native', whose Flow-typed source
// Vitest's transform can't fully handle (e.g. VirtualView.js's JSX) — same fake every other
// core test in this repo uses.
vi.mock('expo-modules-core', () => ({
  CodedError: class CodedError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const getAssetForSource = vi.fn((source: unknown) => source);
const loadSingleFontAsync = vi.fn(async () => {});
vi.mock('./font-loader', () => ({ getAssetForSource, loadSingleFontAsync }));

const getLoadedFonts = vi.fn(() => [] as string[]);
const unloadAllAsync = vi.fn(async () => {});
const unloadAsync = vi.fn(async () => {});
vi.mock('./native-modules', () => ({
  expoFontLoader: { getLoadedFonts, unloadAllAsync, unloadAsync },
}));

const {
  isLoaded,
  getLoadedFonts: coreGetLoadedFonts,
  isLoading,
  loadAsync,
  unloadAllAsync: coreUnloadAllAsync,
  unloadAsync: coreUnloadAsync,
} = await import('./font');
const { purgeCache } = await import('./memory');
const { FontDisplay } = await import('./types');

beforeEach(() => {
  purgeCache();
});

afterEach(() => {
  vi.clearAllMocks();
  getLoadedFonts.mockReturnValue([]);
});

describe('getLoadedFonts (Positive)', () => {
  it('passes through the native module result', () => {
    getLoadedFonts.mockReturnValue(['Inter-Regular']);
    expect(coreGetLoadedFonts()).toEqual(['Inter-Regular']);
    expect(getLoadedFonts).toHaveBeenCalledTimes(1);
  });
});

describe('loadAsync (Positive)', () => {
  it('loads a font once and marks it loaded', async () => {
    await loadAsync('test-font', 'file:///font.ttf');

    expect(loadSingleFontAsync).toHaveBeenCalledTimes(1);
    expect(isLoaded('test-font')).toBe(true);
    expect(isLoading('test-font')).toBe(false);
  });

  it('does not redownload an already-loaded font', async () => {
    await loadAsync('test-font', 'file:///font.ttf');
    await loadAsync('test-font', 'file:///font.ttf');

    expect(loadSingleFontAsync).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent loads of the same font into one native call', async () => {
    const first = loadAsync('test-font', 'file:///font.ttf');
    expect(isLoading('test-font')).toBe(true);
    const second = loadAsync('test-font', 'file:///font.ttf');

    await Promise.all([first, second]);

    expect(loadSingleFontAsync).toHaveBeenCalledTimes(1);
    expect(isLoaded('test-font')).toBe(true);
  });

  it('loads every font in a font map', async () => {
    await loadAsync({
      'test-font-1': 'file:///font-1.ttf',
      'test-font-2': 'file:///font-2.ttf',
    });

    expect(isLoaded('test-font-1')).toBe(true);
    expect(isLoaded('test-font-2')).toBe(true);
  });
});

describe('loadAsync (Negative)', () => {
  it('rejects a null/undefined font source', async () => {
    await expect(loadAsync('test-font', undefined)).rejects.toThrow(
      /Cannot load null or undefined font source/,
    );
    expect(isLoaded('test-font')).toBe(false);
    expect(isLoading('test-font')).toBe(false);
  });

  it('rejects when a fontFamily map is combined with a second source argument', async () => {
    await expect(
      loadAsync({ 'test-font': 'file:///font.ttf' }, 'file:///font.ttf'),
    ).rejects.toThrow(/can only be used with a string value/);
  });

  it('leaves the font unloaded and rethrows when the native load fails', async () => {
    loadSingleFontAsync.mockRejectedValueOnce(new Error('native load failed'));

    await expect(loadAsync('test-font', 'file:///font.ttf')).rejects.toThrow(
      'native load failed',
    );
    expect(isLoaded('test-font')).toBe(false);
    expect(isLoading('test-font')).toBe(false);
  });
});

describe('unloadAllAsync / unloadAsync (Positive)', () => {
  it('purges the cache and calls the native unloadAllAsync', async () => {
    await loadAsync('test-font', 'file:///font.ttf');

    await coreUnloadAllAsync();

    expect(unloadAllAsync).toHaveBeenCalledTimes(1);
  });

  it('unloads a single loaded font by name', async () => {
    await loadAsync('test-font', 'file:///font.ttf');

    await coreUnloadAsync('test-font');

    expect(unloadAsync).toHaveBeenCalledWith('test-font', undefined);
    expect(isLoaded('test-font')).toBe(false);
  });

  it('passes the display options through to the native unloadAsync', async () => {
    await loadAsync('test-font', 'file:///font.ttf');

    await coreUnloadAsync('test-font', { display: FontDisplay.SWAP });

    expect(unloadAsync).toHaveBeenCalledWith('test-font', {
      display: FontDisplay.SWAP,
    });
  });

  it('rejects options combined with a font map, matching loadAsync', async () => {
    await expect(
      coreUnloadAsync({ 'test-font': {} }, { display: FontDisplay.SWAP }),
    ).rejects.toThrow(/can only be used with a string value/);
  });
});

// ExpoFontLoader has no unload method on either iOS or Android upstream (web-only) — this
// "absent" case is the real native shape, not a hypothetical platform gap.
describe('unloadAllAsync / unloadAsync (Negative — native method absent, the real native shape)', () => {
  it('throws UnavailabilityError when the native unloadAllAsync is missing', async () => {
    const { expoFontLoader } = await import('./native-modules');
    // @ts-expect-error -- simulating a platform where the native module has no such method
    expoFontLoader.unloadAllAsync = undefined;

    await expect(coreUnloadAllAsync()).rejects.toThrow(
      'unloadAllAsync is not available on expo-font',
    );

    expoFontLoader.unloadAllAsync = unloadAllAsync;
  });

  it('throws UnavailabilityError when the native unloadAsync is missing', async () => {
    const { expoFontLoader } = await import('./native-modules');
    // @ts-expect-error -- simulating a platform where the native module has no such method
    expoFontLoader.unloadAsync = undefined;

    await expect(coreUnloadAsync('test-font')).rejects.toThrow(
      'unloadAsync is not available on expo-font',
    );

    expoFontLoader.unloadAsync = unloadAsync;
  });
});
