import { createPermissionHook } from '@symbiote-native/solid';
import {
  cameraPermissionMethods,
  microphonePermissionMethods,
} from '../core/camera-api';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { PermissionResponse } from 'expo-modules-core';
import type { Accessor } from 'solid-js';

export type IUseCameraPermissionsHook = (
  options?: IPermissionHookBehavior,
) => [
  Accessor<PermissionResponse | null>,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
];

// Solid twin of `../react`'s camera permission hooks
export const useCameraPermissions: IUseCameraPermissionsHook =
  createPermissionHook(cameraPermissionMethods);
export const useMicrophonePermissions: IUseCameraPermissionsHook =
  createPermissionHook(microphonePermissionMethods);
