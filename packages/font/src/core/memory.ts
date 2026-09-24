// Ported verbatim from expo-font/src/memory.ts (sdk-57) — no web/server branch to drop, this
// module was already native-agnostic.
import { expoFontLoader } from './native-modules';

export const loadPromises: Record<string, Promise<void>> = {};

let cache: Record<string, boolean> = {};

export function markLoaded(fontFamily: string): void {
  cache[fontFamily] = true;
}

export function isLoadedInCache(fontFamily: string): boolean {
  return fontFamily in cache;
}

export function isLoadedNative(fontFamily: string): boolean {
  if (isLoadedInCache(fontFamily)) {
    return true;
  }

  const loadedNativeFonts = expoFontLoader.getLoadedFonts();
  if (!loadedNativeFonts?.length) {
    return false;
  }

  loadedNativeFonts.forEach(font => {
    cache[font] = true;
  });
  return fontFamily in cache;
}

export function purgeFontFamilyFromCache(fontFamily: string): void {
  delete cache[fontFamily];
}

export function purgeCache(): void {
  cache = {};
}
