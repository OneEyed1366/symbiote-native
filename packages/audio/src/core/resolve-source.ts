import { resolveAssetSource } from '@symbiote-native/engine';
import type { IAudioSource } from './types';

type IResolvedAudioSourceObject = Exclude<IAudioSource, string | number | null>;

// resolveAssetSource returns `unknown` by design (the seam serves every require()'d-asset
// consumer, not just this package) — narrow it instead of casting.
function isAudioSourceObject(
  value: unknown,
): value is IResolvedAudioSourceObject {
  return typeof value === 'object' && value !== null;
}

/**
 * Normalizes a source into the shape the native player accepts. A `number` (a `require()`'d
 * local asset) resolves via `@symbiote-native/engine`'s `resolveAssetSource` seam — RN's own
 * generic asset-registry lookup, wired by `bootstrapHost`. An actual `expo-asset` `Asset`
 * instance is still not ported, see `types.ts`'s header comment on `IAudioSource`. A plain
 * string is treated as a URI, matching upstream.
 */
export function resolveSource(source?: IAudioSource): IAudioSource | null {
  if (source == null) {
    return null;
  }
  if (typeof source === 'number') {
    const resolved = resolveAssetSource(source);
    return isAudioSourceObject(resolved) ? resolved : null;
  }
  if (typeof source === 'string') {
    return { uri: source };
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
