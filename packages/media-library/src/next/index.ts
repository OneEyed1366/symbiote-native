import { Platform } from 'react-native';
import {
  createPermissionHook,
  type EventSubscription,
} from 'expo-modules-core';
import { expoMediaLibraryNext } from './native-module';
import type {
  IGranularPermission,
  IMediaLibraryAssetsChangeEvent,
  IMediaLibraryNextPermissionResponse,
  IMediaTypeFilter,
  IPermissionHookOptions,
} from './types';

export { Query } from './query';
export { Asset } from './asset';
export { Album } from './album';
export * from './types';

/**
 * @param granularPermissions Only has an effect on Android 13+. Defaults to every possible
 * permission — make sure your app manifest requests everything you pass here.
 */
export async function requestPermissionsAsync(
  writeOnly: boolean = false,
  granularPermissions?: IGranularPermission[],
): Promise<IMediaLibraryNextPermissionResponse> {
  if (Platform.OS === 'android') {
    return expoMediaLibraryNext.requestPermissionsAsync(
      writeOnly,
      granularPermissions,
    );
  }
  return expoMediaLibraryNext.requestPermissionsAsync(writeOnly);
}

export async function getPermissionsAsync(
  writeOnly: boolean = false,
  granularPermissions?: IGranularPermission[],
): Promise<IMediaLibraryNextPermissionResponse> {
  if (Platform.OS === 'android') {
    return expoMediaLibraryNext.getPermissionsAsync(
      writeOnly,
      granularPermissions,
    );
  }
  return expoMediaLibraryNext.getPermissionsAsync(writeOnly);
}

export const usePermissions = createPermissionHook<
  IMediaLibraryNextPermissionResponse,
  IPermissionHookOptions
>({
  getMethod: (options?: IPermissionHookOptions) =>
    getPermissionsAsync(options?.writeOnly, options?.granularPermissions),
  requestMethod: (options?: IPermissionHookOptions) =>
    requestPermissionsAsync(options?.writeOnly, options?.granularPermissions),
});

/**
 * Allows the user to update the assets your app has access to. Only a no-op unless the user
 * previously granted `'limited'` access.
 */
export async function presentPermissionsPicker(
  mediaTypes?: IMediaTypeFilter[],
): Promise<void> {
  return expoMediaLibraryNext.presentPermissionsPicker(mediaTypes);
}

/**
 * Subscribes for updates in the user's media library. On Android it's invoked with an empty
 * object — only iOS reports `insertedAssets`/`deletedAssets`/`updatedAssets`.
 */
export function addListener(
  listener: (event: IMediaLibraryAssetsChangeEvent) => void,
): EventSubscription {
  return expoMediaLibraryNext.addListener('mediaLibraryDidChange', listener);
}

export function removeAllListeners(): void {
  expoMediaLibraryNext.removeAllListeners('mediaLibraryDidChange');
}
