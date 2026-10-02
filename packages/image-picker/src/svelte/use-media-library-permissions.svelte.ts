import { createPermissionHook } from '@symbiote-native/svelte/runes/create-permission-hook';
import {
  mediaLibraryPermissionMethods,
  splitMediaLibraryPermissionOptions,
  type IMediaLibraryPermissionMethodOptions,
} from '../core/media-library-permission-api';
import type { IMediaLibraryPermissionResponse } from '../core';
import type { IPermissionHookOptions } from '@symbiote-native/engine';

export type IUseMediaLibraryPermissionsOptions =
  IMediaLibraryPermissionMethodOptions;

export type IUseMediaLibraryPermissionsResult = {
  readonly status: IMediaLibraryPermissionResponse | null;
  requestPermission: () => Promise<IMediaLibraryPermissionResponse>;
  getPermission: () => Promise<IMediaLibraryPermissionResponse>;
};

const usePermission = createPermissionHook(mediaLibraryPermissionMethods);

// Svelte twin of `../react`'s `useMediaLibraryPermissions`
export function useMediaLibraryPermissions(
  options?: IPermissionHookOptions<IUseMediaLibraryPermissionsOptions>,
): IUseMediaLibraryPermissionsResult {
  return usePermission(...splitMediaLibraryPermissionOptions(options));
}
