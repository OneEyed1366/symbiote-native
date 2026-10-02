// Ported from expo-font/src/FontLoader.ts (sdk-57), resolving through @symbiote-native/asset's
// Asset class (this repo's own expo-asset port) instead of importing expo-asset directly.
import { Asset } from '@symbiote-native/asset';
import { CodedError } from 'expo-modules-core';

import { expoFontLoader } from './native-modules';
import type { FontResource, FontSource } from './types';

export function getAssetForSource(source: FontSource): Asset | FontResource {
  if (source instanceof Asset) {
    return source;
  }
  if (typeof source === 'string') {
    return Asset.fromURI(source);
  }
  if (typeof source === 'number') {
    return Asset.fromModule(source);
  }
  if (typeof source === 'object' && typeof source.uri !== 'undefined') {
    return getAssetForSource(source.uri);
  }
  return source;
}

export async function loadSingleFontAsync(
  name: string,
  input: Asset | FontResource,
): Promise<void> {
  if (!(input instanceof Asset)) {
    throw new CodedError(
      'ERR_FONT_SOURCE',
      '`loadSingleFontAsync` expected a resource of type `Asset` from @symbiote-native/asset',
    );
  }

  await input.downloadAsync();
  if (!input.downloaded || !input.localUri) {
    throw new CodedError(
      'ERR_DOWNLOAD',
      `Failed to download asset for font "${name}"`,
    );
  }
  await expoFontLoader.loadAsync(name, input.localUri);
}
