import { createPermissionHook } from '@symbiote-native/vue';
import {
  backgroundPermissionMethods,
  foregroundPermissionMethods,
  motionActivityPermissionMethods,
} from '../core/location-permission-api';
import type { ILocationPermissionResponse } from '../core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { PermissionResponse } from 'expo-modules-core';
import type { Ref } from '@vue/runtime-core';

export type IUseLocationPermissionsHook<TPermission> = (
  options?: IPermissionHookBehavior,
) => [
  Ref<TPermission | null>,
  () => Promise<TPermission>,
  () => Promise<TPermission>,
];

// Vue twin of `../react`'s location permission hooks
export const useForegroundPermissions: IUseLocationPermissionsHook<ILocationPermissionResponse> =
  createPermissionHook(foregroundPermissionMethods);
export const useBackgroundPermissions: IUseLocationPermissionsHook<PermissionResponse> =
  createPermissionHook(backgroundPermissionMethods);
export const useMotionActivityPermissions: IUseLocationPermissionsHook<PermissionResponse> =
  createPermissionHook(motionActivityPermissionMethods);
