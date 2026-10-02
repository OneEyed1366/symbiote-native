import { createPermissionHook } from '@symbiote-native/svelte/runes/create-permission-hook';
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
) => {
  readonly status: TPermission | null;
  requestPermission: () => Promise<TPermission>;
  getPermission: () => Promise<TPermission>;
};

// Svelte twin of `../react`'s location permission hooks
export const useForegroundPermissions: IUseLocationPermissionsHook<ILocationPermissionResponse> =
  createPermissionHook(foregroundPermissionMethods);
export const useBackgroundPermissions: IUseLocationPermissionsHook<PermissionResponse> =
  createPermissionHook(backgroundPermissionMethods);
export const useMotionActivityPermissions: IUseLocationPermissionsHook<PermissionResponse> =
  createPermissionHook(motionActivityPermissionMethods);
