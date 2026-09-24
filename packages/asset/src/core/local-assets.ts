// Ported verbatim from expo-asset/src/LocalAssets.ts (sdk-57). localAssets comes from
// expo-updates (classic-updates/Expo-Go asset overrides) via platform-utils.ts — always `{}`
// in a bare app that ships neither, so this always falls through to null there.
import { getLocalAssets } from './platform-utils';

const localAssets = getLocalAssets();

export function getLocalAssetUri(
  hash: string,
  type: string | null,
): string | null {
  const localAssetsKey = hash;
  const legacyLocalAssetsKey = `${hash}.${type ?? ''}`;

  if (localAssetsKey in localAssets) {
    return localAssets[localAssetsKey] ?? null;
  }
  if (legacyLocalAssetsKey in localAssets) {
    return localAssets[legacyLocalAssetsKey] ?? null;
  }
  return null;
}
