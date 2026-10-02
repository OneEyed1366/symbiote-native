import {
  requireNativeModule,
  requireOptionalNativeModule,
} from 'expo-modules-core';
import type { ProcessedColorValue } from 'react-native';

import type { UnloadFontOptions } from './types';

export type INativeFontLoaderModule = {
  getLoadedFonts(): string[];
  loadAsync(fontFamilyName: string, localUri: string): Promise<void>;
  unloadAllAsync?(): Promise<void>;
  unloadAsync?(
    fontFamilyName: string,
    options?: UnloadFontOptions,
  ): Promise<void>;
};

export type INativeRenderToImageOptions = {
  fontFamily?: string;
  size?: number;
  color?: ProcessedColorValue;
  lineHeight?: number;
};

export type INativeFontUtilsModule = {
  renderToImageAsync(
    glyphs: string,
    options?: INativeRenderToImageOptions,
  ): Promise<{ uri: string; width: number; height: number; scale: number }>;
};

const EXPO_FONT_LOADER_MODULE_NAME = 'ExpoFontLoader';
const EXPO_FONT_UTILS_MODULE_NAME = 'ExpoFontUtils';

export const expoFontLoader = requireNativeModule<INativeFontLoaderModule>(
  EXPO_FONT_LOADER_MODULE_NAME,
);

// Present on both iOS and Android upstream — still optional (matches upstream's own
// requireOptionalNativeModule) since only web ships without it.
export const expoFontUtils =
  requireOptionalNativeModule<INativeFontUtilsModule>(
    EXPO_FONT_UTILS_MODULE_NAME,
  );
