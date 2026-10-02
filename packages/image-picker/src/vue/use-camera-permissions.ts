import { createPermissionHook } from '@symbiote-native/vue';
import {
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
} from '../core';
import type { ICameraPermissionResponse } from '../core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { Ref } from '@vue/runtime-core';

export type IUseCameraPermissionsResult = [
  Ref<ICameraPermissionResponse | null>,
  () => Promise<ICameraPermissionResponse>,
  () => Promise<ICameraPermissionResponse>,
];

const usePermission = createPermissionHook({
  getMethod: getCameraPermissionsAsync,
  requestMethod: requestCameraPermissionsAsync,
});

// Vue twin of `../react`'s `useCameraPermissions`
export function useCameraPermissions(
  options?: IPermissionHookBehavior,
): IUseCameraPermissionsResult {
  return usePermission(options);
}
