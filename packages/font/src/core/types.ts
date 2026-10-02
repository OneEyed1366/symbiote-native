// Ported from expo-font/src/Font.types.ts (sdk-57) — full parity, including the `number`
// (require() module) and `Asset` instance source forms, both resolved via @symbiote-native/asset.
import type { Asset } from '@symbiote-native/asset';

/** @platform web — has no effect on native, kept for API-surface parity with upstream. */
export enum FontDisplay {
  AUTO = 'auto',
  SWAP = 'swap',
  BLOCK = 'block',
  FALLBACK = 'fallback',
  OPTIONAL = 'optional',
}

export type FontResource = {
  uri?: string | number;
  display?: FontDisplay;
  default?: string;
  testString?: string;
};

export type FontSource = string | number | Asset | FontResource;

export type UnloadFontOptions = Pick<FontResource, 'display'>;

export type UseFontsResult = readonly [loaded: boolean, error: Error | null];
