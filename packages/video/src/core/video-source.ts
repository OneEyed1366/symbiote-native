import { resolveAssetSource } from '@symbiote-native/engine';
import type { IVideoSource } from './player-types';

function uriOfAsset(assetId: number): string {
  const resolved = resolveAssetSource(assetId);
  const uri: unknown = Reflect.get(Object(resolved), 'uri');
  if (typeof uri !== 'string') {
    throw new Error(`The asset ${assetId} could not be resolved`);
  }
  return uri;
}

/** What the native player takes: a `require`d asset and a string both become a uri */
export function parseSource(source: IVideoSource): IVideoSource {
  if (typeof source === 'number') return { uri: uriOfAsset(source) };
  if (typeof source === 'string') return { uri: source };
  if (typeof source?.assetId === 'number' && !source.uri) {
    return { ...source, uri: uriOfAsset(source.assetId) };
  }
  return source;
}
