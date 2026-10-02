import { createPermissionHook } from '@symbiote-native/vue';
import type { IMediaLibraryPermissionResponse } from '../core';
import {
  mediaLibraryPermissionMethods,
  splitMediaLibraryPermissionOptions,
  type IMediaLibraryPermissionMethodOptions,
} from '../core/media-library-permission-api';
import type { IPermissionHookOptions } from '@symbiote-native/engine';
import type { Ref } from '@vue/runtime-core';

export type IUseMediaLibraryPermissionsOptions =
  IMediaLibraryPermissionMethodOptions;

export type IUseMediaLibraryPermissionsResult = [
  Ref<IMediaLibraryPermissionResponse | null>,
  () => Promise<IMediaLibraryPermissionResponse>,
  () => Promise<IMediaLibraryPermissionResponse>,
];

const usePermission = createPermissionHook(mediaLibraryPermissionMethods);

// Vue twin of `../react`'s `useMediaLibraryPermissions`
export function useMediaLibraryPermissions(
  options?: IPermissionHookOptions<IUseMediaLibraryPermissionsOptions>,
): IUseMediaLibraryPermissionsResult {
  return usePermission(...splitMediaLibraryPermissionOptions(options));
}
