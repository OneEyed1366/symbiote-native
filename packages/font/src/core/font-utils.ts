// Ported from expo-font/src/FontUtils.ts (sdk-57).
import { UnavailabilityError } from 'expo-modules-core';
import { processColor } from 'react-native';

import { expoFontUtils } from './native-modules';

export type IRenderToImageOptions = {
  fontFamily?: string;
  size?: number;
  color?: string;
  lineHeight?: number;
};

export type IRenderToImageResult = {
  uri: string;
  width: number;
  height: number;
  scale: number;
};

/** @platform android @platform ios */
export async function renderToImageAsync(
  glyphs: string,
  options?: IRenderToImageOptions,
): Promise<IRenderToImageResult> {
  if (!expoFontUtils) {
    throw new UnavailabilityError(
      'expo-font',
      'ExpoFontUtils.renderToImageAsync',
    );
  }

  return expoFontUtils.renderToImageAsync(glyphs, {
    ...options,
    color: options?.color
      ? (processColor(options.color) ?? undefined)
      : undefined,
  });
}
