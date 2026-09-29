import { createPermissionHook } from '@symbiote-native/solid';
import type { IMediaLibraryPermissionResponse } from '../core';
import {
  mediaLibraryPermissionMethods,
  splitMediaLibraryPermissionOptions,
  type IMediaLibraryPermissionMethodOptions,
} from '../core/media-library-permission-api';
import type { IPermissionHookOptions } from '@symbiote-native/engine';
import type { Accessor } from 'solid-js';

export type IUseMediaLibraryPermissionsOptions =
  IMediaLibraryPermissionMethodOptions;

export type IUseMediaLibraryPermissionsResult = [
  Accessor<IMediaLibraryPermissionResponse | null>,
  () => Promise<IMediaLibraryPermissionResponse>,
  () => Promise<IMediaLibraryPermissionResponse>,
];

const usePermission = createPermissionHook(mediaLibraryPermissionMethods);

// Solid twin of `../react`'s `useMediaLibraryPermissions`
export function useMediaLibraryPermissions(
  options?: IPermissionHookOptions<IUseMediaLibraryPermissionsOptions>,
): IUseMediaLibraryPermissionsResult {
  return usePermission(...splitMediaLibraryPermissionOptions(options));
}
