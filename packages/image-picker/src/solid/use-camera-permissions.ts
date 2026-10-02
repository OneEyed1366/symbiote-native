import { createPermissionHook } from '@symbiote-native/solid';
import {
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
} from '../core';
import type { ICameraPermissionResponse } from '../core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { Accessor } from 'solid-js';

export type IUseCameraPermissionsResult = [
  Accessor<ICameraPermissionResponse | null>,
  () => Promise<ICameraPermissionResponse>,
  () => Promise<ICameraPermissionResponse>,
];

const usePermission = createPermissionHook({
  getMethod: getCameraPermissionsAsync,
  requestMethod: requestCameraPermissionsAsync,
});

// Solid twin of `../react`'s `useCameraPermissions`
export function useCameraPermissions(
  options?: IPermissionHookBehavior,
): IUseCameraPermissionsResult {
  return usePermission(options);
}
