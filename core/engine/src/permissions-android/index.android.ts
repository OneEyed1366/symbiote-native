// PermissionsAndroid, Android build: RN's PermissionsAndroid.js with `Platform.OS === 'android'`.
// Every call reaches the native module and returns what it returns; a missing module is RN's
// invariant. request() shows the rationale through DialogManagerAndroid first when native says to.

import { dlog } from '../debug';
import { invariant } from '../invariant';
import { getNativeModule } from '../native-modules';

import {
  CHECK_PERMISSION_DEPRECATED,
  PERMISSIONS,
  PERMISSIONS_ANDROID_MODULE,
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

const NOT_INSTALLED = 'PermissionsAndroid is not installed correctly.';

// RN's TurboModule spec, the one place the native shape is vouched for.
interface INativePermissionsAndroid {
  checkPermission(permission: IPermission): Promise<boolean>;
  requestPermission(permission: IPermission): Promise<IPermissionStatus>;
  shouldShowRequestPermissionRationale(
    permission: IPermission,
  ): Promise<boolean>;
  requestMultiplePermissions(
    permissions: IPermission[],
  ): Promise<Record<string, IPermissionStatus>>;
}

interface INativeDialogManagerAndroid {
  showAlert(
    config: IRationale,
    onError: (error: string) => void,
    onAction: (action: string, buttonKey?: number) => void,
  ): void;
}

function requireModule(): INativePermissionsAndroid {
  const module = getNativeModule<INativePermissionsAndroid>(
    PERMISSIONS_ANDROID_MODULE,
  );
  dlog(
    `PermissionsAndroid: module ${module ? 'resolved' : 'NOT resolved (null)'}`,
  );
  invariant(module !== null, NOT_INSTALLED);
  return module;
}

export const PermissionsAndroid = {
  PERMISSIONS,
  RESULTS,

  checkPermission(permission: IPermission): Promise<boolean> {
    console.warn(CHECK_PERMISSION_DEPRECATED);
    return requireModule().checkPermission(permission);
  },

  check(permission: IPermission): Promise<boolean> {
    return requireModule().checkPermission(permission);
  },

  async requestPermission(
    permission: IPermission,
    rationale?: IRationale,
  ): Promise<boolean> {
    console.warn(REQUEST_PERMISSION_DEPRECATED);
    const response = await PermissionsAndroid.request(permission, rationale);
    return response === RESULTS.GRANTED;
  },

  async request(
    permission: IPermission,
    rationale?: IRationale,
  ): Promise<IPermissionStatus> {
    const module = requireModule();
    if (rationale) {
      const shouldShowRationale =
        await module.shouldShowRequestPermissionRationale(permission);
      const dialog = getNativeModule<INativeDialogManagerAndroid>(
        'DialogManagerAndroid',
      );
      if (shouldShowRationale && dialog !== null) {
        return new Promise((resolve, reject) => {
          dialog.showAlert(
            { ...rationale },
            () => reject(new Error('Error showing rationale')),
            () => resolve(module.requestPermission(permission)),
          );
        });
      }
    }
    return module.requestPermission(permission);
  },

  requestMultiple(
    permissions: IPermission[],
  ): Promise<Record<string, IPermissionStatus>> {
    return requireModule().requestMultiplePermissions(permissions);
  },
};
