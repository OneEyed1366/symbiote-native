import { createPermissionHook } from '@symbiote-native/svelte/runes/create-permission-hook';
import {
  cameraPermissionMethods,
  microphonePermissionMethods,
} from '../core/camera-api';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { PermissionResponse } from 'expo-modules-core';

export type IUseCameraPermissionsHook = (options?: IPermissionHookBehavior) => {
  readonly status: PermissionResponse | null;
  requestPermission: () => Promise<PermissionResponse>;
  getPermission: () => Promise<PermissionResponse>;
};

// Svelte twin of `../react`'s camera permission hooks
export const useCameraPermissions: IUseCameraPermissionsHook =
  createPermissionHook(cameraPermissionMethods);
export const useMicrophonePermissions: IUseCameraPermissionsHook =
  createPermissionHook(microphonePermissionMethods);
