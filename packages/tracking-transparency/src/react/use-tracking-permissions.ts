import { createPermissionHook } from '@symbiote-native/react';
import { trackingPermissionMethods } from '../core/tracking-permission-api';
import type { PermissionResponse } from '../core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';

export type IUseTrackingPermissionsHook = (
  options?: IPermissionHookBehavior,
) => [
  PermissionResponse | null,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
];

// React twin of `expo-tracking-transparency`'s `useTrackingPermissions`
export const useTrackingPermissions: IUseTrackingPermissionsHook =
  createPermissionHook(trackingPermissionMethods);
