// Ported from expo-audio/src/utils/resolveSource.ts (sdk-57), against @symbiote-native/asset's
// Asset class instead of importing expo-asset directly (same pattern as packages/font).
import { Asset } from '@symbiote-native/asset';

import type { IAudioSource } from './types';

type IResolvedAudioSourceObject = Exclude<
  IAudioSource,
  string | number | Asset | null
>;

function getAssetFromSource(source?: IAudioSource): Asset | null {
  if (!source) {
    return null;
  }
  if (source instanceof Asset) {
    return source;
  }
  if (typeof source === 'number') {
    return Asset.fromModule(source);
  }
  if (typeof source === 'object') {
    if ('assetId' in source && typeof source.assetId === 'number') {
      return Asset.fromModule(source.assetId);
    }
    if ('uri' in source && typeof source.uri === 'string') {
      return Asset.fromURI(source.uri);
    }
  }
  if (typeof source === 'string') {
    return Asset.fromURI(source);
  }
  return null;
}

function createSourceFromAsset(
  asset: Asset,
  extras: { assetId?: number; headers?: Record<string, string> } = {},
): IResolvedAudioSourceObject {
  const result: IResolvedAudioSourceObject = {
    uri: asset.localUri ?? asset.uri,
  };
  if (asset.name) {
    result.name = asset.name;
  }
  if (extras.assetId != null) {
    result.assetId = extras.assetId;
  }
  if (extras.headers) {
    result.headers = extras.headers;
  }
  return result;
}

export function resolveSource(source?: IAudioSource): IAudioSource | null {
  if (source == null) {
    return null;
  }
  if (source instanceof Asset) {
    return createSourceFromAsset(source);
  }
  if (typeof source === 'string') {
    return { uri: source };
  }
  if (typeof source === 'number') {
    return createSourceFromAsset(Asset.fromModule(source), { assetId: source });
  }
  if ('assetId' in source && typeof source.assetId === 'number') {
    const asset = Asset.fromModule(source.assetId);
    return { ...source, uri: asset.localUri ?? asset.uri };
  }
  return source;
}

export function resolveSources(
  sources: IAudioSource[],
): NonNullable<IAudioSource>[] {
  return sources
    .map(source => resolveSource(source))
    .filter((source): source is NonNullable<IAudioSource> => source != null);
}

/** Resolves `source` and, unlike `resolveSource`, downloads it to a local cache file first. */
export async function resolveSourceWithDownload(
  source?: IAudioSource,
): Promise<IAudioSource | null> {
  const asset = getAssetFromSource(source);
  const fallback = resolveSource(source);
  if (!asset) {
    return fallback;
  }
  try {
    await asset.downloadAsync();
    if (asset.localUri) {
      return fallback && typeof fallback === 'object'
        ? { ...fallback, uri: asset.localUri }
        : { uri: asset.localUri };
    }
  } catch {
    // Falls through to the un-downloaded source below, matching upstream's own recovery path.
  }
  return fallback;
}
