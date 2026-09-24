import { requireNativeModule } from 'expo-modules-core';

export type INativeAssetModule = {
  downloadAsync(
    url: string,
    md5Hash: string | null,
    type: string,
  ): Promise<string>;
};

export const expoAsset = requireNativeModule<INativeAssetModule>('ExpoAsset');
