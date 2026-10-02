// `methods` every adapter's `useMediaLibraryPermissions` binds to the shared
// `@symbiote-native/{react,vue,solid}` `createPermissionHook` factory

import {
  getMediaLibraryPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} from './index';
import type { IMediaLibraryPermissionResponse } from './types';
import { splitWriteOnlyPermissionOptions } from '@symbiote-native/engine';

export type IMediaLibraryPermissionMethodOptions = { writeOnly?: boolean };

export const mediaLibraryPermissionMethods = {
  getMethod: (options?: IMediaLibraryPermissionMethodOptions) =>
    getMediaLibraryPermissionsAsync(options?.writeOnly),
  requestMethod: (options?: IMediaLibraryPermissionMethodOptions) =>
    requestMediaLibraryPermissionsAsync(options?.writeOnly),
};

export const splitMediaLibraryPermissionOptions =
  splitWriteOnlyPermissionOptions;

export type { IMediaLibraryPermissionResponse };
