import { createPermissionHook } from '@symbiote-native/react';
import {
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
} from '../core';
import type { ICameraPermissionResponse } from '../core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';

export type IUseCameraPermissionsResult = [
  ICameraPermissionResponse | null,
  () => Promise<ICameraPermissionResponse>,
  () => Promise<ICameraPermissionResponse>,
];

const usePermission = createPermissionHook({
  getMethod: getCameraPermissionsAsync,
  requestMethod: requestCameraPermissionsAsync,
});

// React twin of `expo-image-picker`'s `useCameraPermissions`
export function useCameraPermissions(
  options?: IPermissionHookBehavior,
): IUseCameraPermissionsResult {
  return usePermission(options);
}
