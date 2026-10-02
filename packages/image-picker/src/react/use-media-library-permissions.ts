import { createPermissionHook } from '@symbiote-native/react';
import type { IMediaLibraryPermissionResponse } from '../core';
import {
  mediaLibraryPermissionMethods,
  splitMediaLibraryPermissionOptions,
  type IMediaLibraryPermissionMethodOptions,
} from '../core/media-library-permission-api';
import type { IPermissionHookOptions } from '@symbiote-native/engine';

export type IUseMediaLibraryPermissionsOptions =
  IMediaLibraryPermissionMethodOptions;

export type IUseMediaLibraryPermissionsResult = [
  IMediaLibraryPermissionResponse | null,
  () => Promise<IMediaLibraryPermissionResponse>,
  () => Promise<IMediaLibraryPermissionResponse>,
];

const usePermission = createPermissionHook(mediaLibraryPermissionMethods);

// React twin of `expo-image-picker`'s `useMediaLibraryPermissions`
export function useMediaLibraryPermissions(
  options?: IPermissionHookOptions<IUseMediaLibraryPermissionsOptions>,
): IUseMediaLibraryPermissionsResult {
  return usePermission(...splitMediaLibraryPermissionOptions(options));
}
