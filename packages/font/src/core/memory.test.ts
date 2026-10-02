// Ported from the native-fallback behavior expo-font/src/memory.ts documents inline (sdk-57) —
// upstream ships no dedicated memory test; this covers the cache/native-fallback contract
// font.test.ts exercises only indirectly through loadAsync.
import { afterEach, describe, expect, it, vi } from 'vitest';

const getLoadedFonts = vi.fn(() => [] as string[]);
vi.mock('./native-modules', () => ({ expoFontLoader: { getLoadedFonts } }));

const {
  isLoadedInCache,
  isLoadedNative,
  markLoaded,
  purgeCache,
  purgeFontFamilyFromCache,
} = await import('./memory');

afterEach(() => {
  purgeCache();
  vi.clearAllMocks();
  getLoadedFonts.mockReturnValue([]);
});

describe('isLoadedNative (Positive)', () => {
  it('reports true and caches once markLoaded records a font', () => {
    markLoaded('test-font');
    expect(isLoadedInCache('test-font')).toBe(true);
    expect(isLoadedNative('test-font')).toBe(true);
  });

  it('falls back to the native module when the cache is empty, then caches the result', () => {
    getLoadedFonts.mockReturnValue(['native-font']);

    expect(isLoadedNative('native-font')).toBe(true);
    expect(getLoadedFonts).toHaveBeenCalledTimes(1);
    expect(isLoadedInCache('native-font')).toBe(true);
  });

  it('does not throw and reports false when the native module reports no fonts at all', () => {
    getLoadedFonts.mockReturnValue([]);
    expect(isLoadedNative('missing-font')).toBe(false);
  });
});

describe('purgeFontFamilyFromCache / purgeCache (Positive)', () => {
  it('removes one entry without touching the rest of the cache', () => {
    markLoaded('font-a');
    markLoaded('font-b');

    purgeFontFamilyFromCache('font-a');

    expect(isLoadedInCache('font-a')).toBe(false);
    expect(isLoadedInCache('font-b')).toBe(true);
  });

  it('clears the whole cache', () => {
    markLoaded('font-a');
    markLoaded('font-b');

    purgeCache();

    expect(isLoadedInCache('font-a')).toBe(false);
    expect(isLoadedInCache('font-b')).toBe(false);
  });
});
