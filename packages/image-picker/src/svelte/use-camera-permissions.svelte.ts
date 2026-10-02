import { createPermissionHook } from '@symbiote-native/svelte/runes/create-permission-hook';
import {
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
} from '../core';
import type { ICameraPermissionResponse } from '../core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';

export type IUseCameraPermissionsResult = {
  readonly status: ICameraPermissionResponse | null;
  requestPermission: () => Promise<ICameraPermissionResponse>;
  getPermission: () => Promise<ICameraPermissionResponse>;
};

const usePermission = createPermissionHook({
  getMethod: getCameraPermissionsAsync,
  requestMethod: requestCameraPermissionsAsync,
});

// Svelte twin of `../react`'s `useCameraPermissions`
export function useCameraPermissions(
  behavior?: IPermissionHookBehavior,
): IUseCameraPermissionsResult {
  return usePermission(behavior);
}
