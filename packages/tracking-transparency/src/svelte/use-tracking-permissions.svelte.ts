import { createPermissionHook } from '@symbiote-native/svelte/runes/create-permission-hook';
import { trackingPermissionMethods } from '../core/tracking-permission-api';
import type { PermissionResponse } from '../core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';

export type IUseTrackingPermissionsHook = (
  options?: IPermissionHookBehavior,
) => {
  readonly status: PermissionResponse | null;
  requestPermission: () => Promise<PermissionResponse>;
  getPermission: () => Promise<PermissionResponse>;
};

// Svelte twin of `../react`'s `useTrackingPermissions`
export const useTrackingPermissions: IUseTrackingPermissionsHook =
  createPermissionHook(trackingPermissionMethods);
