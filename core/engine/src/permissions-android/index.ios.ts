// PermissionsAndroid off Android: RN's PermissionsAndroid.js `Platform.OS !== 'android'` branches.
// Each call warns that the module is Android-only (RN's own user-facing warning) and resolves a
// fixed answer; nothing reaches native.

import {
  ANDROID_ONLY_WARNING,
  CHECK_PERMISSION_DEPRECATED,
  PERMISSIONS,
  REQUEST_PERMISSION_DEPRECATED,
  RESULTS,
  type IPermission,
  type IPermissionStatus,
  type IRationale,
} from './shared';

export {
  PERMISSIONS,
  RESULTS,
  type IPermission,
  type IPermissionStatus,
  type IRationale,
} from './shared';

export const PermissionsAndroid = {
  PERMISSIONS,
  RESULTS,

  checkPermission(_permission: IPermission): Promise<boolean> {
    console.warn(CHECK_PERMISSION_DEPRECATED);
    console.warn(ANDROID_ONLY_WARNING);
    return Promise.resolve(false);
  },

  check(_permission: IPermission): Promise<boolean> {
    console.warn(ANDROID_ONLY_WARNING);
    return Promise.resolve(false);
  },

  requestPermission(
    _permission: IPermission,
    _rationale?: IRationale,
  ): Promise<boolean> {
    console.warn(REQUEST_PERMISSION_DEPRECATED);
    console.warn(ANDROID_ONLY_WARNING);
    return Promise.resolve(false);
  },

  request(
    _permission: IPermission,
    _rationale?: IRationale,
  ): Promise<IPermissionStatus> {
    console.warn(ANDROID_ONLY_WARNING);
    return Promise.resolve(RESULTS.DENIED);
  },

  requestMultiple(
    _permissions: IPermission[],
  ): Promise<Record<string, IPermissionStatus>> {
    console.warn(ANDROID_ONLY_WARNING);
    return Promise.resolve({});
  },
};
