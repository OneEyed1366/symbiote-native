import { createPermissionHook } from '@symbiote-native/solid';
import {
  backgroundPermissionMethods,
  foregroundPermissionMethods,
  motionActivityPermissionMethods,
} from '../core/location-permission-api';
import type { ILocationPermissionResponse } from '../core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { PermissionResponse } from 'expo-modules-core';
import type { Accessor } from 'solid-js';

export type IUseLocationPermissionsHook<TPermission> = (
  options?: IPermissionHookBehavior,
) => [
  Accessor<TPermission | null>,
  () => Promise<TPermission>,
  () => Promise<TPermission>,
];

// Solid twin of `../react`'s location permission hooks
export const useForegroundPermissions: IUseLocationPermissionsHook<ILocationPermissionResponse> =
  createPermissionHook(foregroundPermissionMethods);
export const useBackgroundPermissions: IUseLocationPermissionsHook<PermissionResponse> =
  createPermissionHook(backgroundPermissionMethods);
export const useMotionActivityPermissions: IUseLocationPermissionsHook<PermissionResponse> =
  createPermissionHook(motionActivityPermissionMethods);
