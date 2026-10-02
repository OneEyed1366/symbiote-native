// Ported from expo-sqlite's hooks.tsx's importDatabaseFromAssetAsync (.vendors/expo @
// origin/sdk-57), against @symbiote-native/asset's Asset class instead of importing expo-asset
// directly (same pattern as packages/font, packages/audio).
import { Asset } from '@symbiote-native/asset';

import { expoSQLite } from './native-module';
import { createDatabasePath } from './path-utils';
import type { ISQLiteAssetSource } from './types';

/** Downloads `assetSource`'s bundled database and copies it into place as `databaseName`. */
export async function importDatabaseFromAssetAsync(
  databaseName: string,
  assetSource: ISQLiteAssetSource,
  directory?: string,
): Promise<void> {
  const asset = await Asset.fromModule(assetSource.assetId).downloadAsync();
  if (!asset.localUri) {
    throw new Error(
      `Unable to get the localUri from asset ${assetSource.assetId}`,
    );
  }
  const path = createDatabasePath(databaseName, directory);
  await expoSQLite.importAssetDatabaseAsync(
    path,
    asset.localUri,
    assetSource.forceOverwrite ?? false,
  );
}
