// Ported from expo-font/src/Font.ts (sdk-57), native-only — drops the web/server branches
// (isLoaded's web fallback, loadAsync's server pre-render pass, registerStaticFont).
import { CodedError, UnavailabilityError } from 'expo-modules-core';

import { getAssetForSource, loadSingleFontAsync } from './font-loader';
import {
  isLoadedNative,
  loadPromises,
  markLoaded,
  purgeCache,
  purgeFontFamilyFromCache,
} from './memory';
import { expoFontLoader } from './native-modules';
import type { FontSource, UnloadFontOptions } from './types';

export function isLoaded(fontFamily: string): boolean {
  return isLoadedNative(fontFamily);
}

export function getLoadedFonts(): string[] {
  return expoFontLoader.getLoadedFonts();
}

export function isLoading(fontFamily: string): boolean {
  return fontFamily in loadPromises;
}

/** Shared seed check for every adapter's `useFonts`/`createFonts` lifecycle wrapper. */
export function isFontMapLoaded(
  map: string | Record<string, FontSource>,
): boolean {
  if (typeof map === 'string') {
    return isLoaded(map);
  }
  return Object.keys(map).every(fontFamily => isLoaded(fontFamily));
}

export function loadAsync(
  fontFamilyOrFontMap: string | Record<string, FontSource>,
  source?: FontSource,
): Promise<void> {
  if (typeof fontFamilyOrFontMap === 'object') {
    if (source) {
      return Promise.reject(
        new CodedError(
          'ERR_FONT_API',
          `No fontFamily can be used for the provided source: ${String(source)}. The second argument of loadAsync() can only be used with a string value as the first argument.`,
        ),
      );
    }
    const fontMap = fontFamilyOrFontMap;
    const names = Object.keys(fontMap);
    return Promise.all(
      names.map(name => loadFontInNamespaceAsync(name, fontMap[name])),
    ).then(() => {});
  }

  return loadFontInNamespaceAsync(fontFamilyOrFontMap, source);
}

async function loadFontInNamespaceAsync(
  fontFamily: string,
  source?: FontSource | null,
): Promise<void> {
  if (!source) {
    throw new CodedError(
      'ERR_FONT_SOURCE',
      `Cannot load null or undefined font source for fontFamily "${fontFamily}".`,
    );
  }

  if (isLoaded(fontFamily)) {
    return;
  }

  if (Object.hasOwn(loadPromises, fontFamily)) {
    return loadPromises[fontFamily];
  }

  const asset = getAssetForSource(source);
  loadPromises[fontFamily] = (async () => {
    try {
      await loadSingleFontAsync(fontFamily, asset);
      markLoaded(fontFamily);
    } finally {
      delete loadPromises[fontFamily];
    }
  })();

  await loadPromises[fontFamily];
}

/** Always throws on native — ExpoFontLoader has no unload method there, web-only upstream. */
export async function unloadAllAsync(): Promise<void> {
  if (!expoFontLoader.unloadAllAsync) {
    throw new UnavailabilityError('expo-font', 'unloadAllAsync');
  }
  if (Object.keys(loadPromises).length) {
    throw new CodedError(
      'ERR_UNLOAD',
      `Cannot unload fonts while they're still loading: ${Object.keys(loadPromises).join(', ')}`,
    );
  }
  purgeCache();
  await expoFontLoader.unloadAllAsync();
}

/** Always throws on native — ExpoFontLoader has no unload method there, web-only upstream. */
export async function unloadAsync(
  fontFamilyOrFontMap: string | Record<string, UnloadFontOptions>,
  options?: UnloadFontOptions,
): Promise<void> {
  if (!expoFontLoader.unloadAsync) {
    throw new UnavailabilityError('expo-font', 'unloadAsync');
  }
  if (typeof fontFamilyOrFontMap === 'object') {
    if (options) {
      throw new CodedError(
        'ERR_FONT_API',
        `No fontFamily can be used for the provided options: ${String(options)}. The second argument of unloadAsync() can only be used with a string value as the first argument.`,
      );
    }
    const names = Object.keys(fontFamilyOrFontMap);
    await Promise.all(
      names.map(name =>
        unloadFontInNamespaceAsync(name, fontFamilyOrFontMap[name]),
      ),
    );
    return;
  }
  return unloadFontInNamespaceAsync(fontFamilyOrFontMap, options);
}

async function unloadFontInNamespaceAsync(
  fontFamily: string,
  options?: UnloadFontOptions,
): Promise<void> {
  if (!isLoaded(fontFamily)) {
    return;
  }
  purgeFontFamilyFromCache(fontFamily);

  if (!fontFamily) {
    throw new CodedError('ERR_FONT_FAMILY', 'Cannot unload an empty name');
  }
  if (!expoFontLoader.unloadAsync) {
    throw new UnavailabilityError('expo-font', 'unloadAsync');
  }
  await expoFontLoader.unloadAsync(fontFamily, options);
}
