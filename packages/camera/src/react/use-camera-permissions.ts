import { createPermissionHook } from '@symbiote-native/react';
import {
  cameraPermissionMethods,
  microphonePermissionMethods,
} from '../core/camera-api';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { PermissionResponse } from 'expo-modules-core';

export type IUseCameraPermissionsHook = (
  options?: IPermissionHookBehavior,
) => [
  PermissionResponse | null,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
];

// React twin of `expo-camera`'s permission hooks
export const useCameraPermissions: IUseCameraPermissionsHook =
  createPermissionHook(cameraPermissionMethods);
export const useMicrophonePermissions: IUseCameraPermissionsHook =
  createPermissionHook(microphonePermissionMethods);
