import { createPermissionHook } from '@symbiote-native/react';
import {
  backgroundPermissionMethods,
  foregroundPermissionMethods,
  motionActivityPermissionMethods,
} from '../core/location-permission-api';
import type { ILocationPermissionResponse } from '../core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { PermissionResponse } from 'expo-modules-core';

export type IUseLocationPermissionsHook<TPermission> = (
  options?: IPermissionHookBehavior,
) => [
  TPermission | null,
  () => Promise<TPermission>,
  () => Promise<TPermission>,
];

// React twin of `expo-location`'s permission hooks
export const useForegroundPermissions: IUseLocationPermissionsHook<ILocationPermissionResponse> =
  createPermissionHook(foregroundPermissionMethods);
export const useBackgroundPermissions: IUseLocationPermissionsHook<PermissionResponse> =
  createPermissionHook(backgroundPermissionMethods);
export const useMotionActivityPermissions: IUseLocationPermissionsHook<PermissionResponse> =
  createPermissionHook(motionActivityPermissionMethods);
