import { createPermissionHook } from '@symbiote-native/vue';
import {
  cameraPermissionMethods,
  microphonePermissionMethods,
} from '../core/camera-api';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { PermissionResponse } from 'expo-modules-core';
import type { Ref } from '@vue/runtime-core';

export type IUseCameraPermissionsHook = (
  options?: IPermissionHookBehavior,
) => [
  Ref<PermissionResponse | null>,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
];

// Vue twin of `../react`'s camera permission hooks
export const useCameraPermissions: IUseCameraPermissionsHook =
  createPermissionHook(cameraPermissionMethods);
export const useMicrophonePermissions: IUseCameraPermissionsHook =
  createPermissionHook(microphonePermissionMethods);
