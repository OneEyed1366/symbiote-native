import { createPermissionHook } from '@symbiote-native/solid';
import { trackingPermissionMethods } from '../core/tracking-permission-api';
import type { PermissionResponse } from '../core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { Accessor } from 'solid-js';

export type IUseTrackingPermissionsHook = (
  options?: IPermissionHookBehavior,
) => [
  Accessor<PermissionResponse | null>,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
];

// Solid twin of `../react`'s `useTrackingPermissions`
export const useTrackingPermissions: IUseTrackingPermissionsHook =
  createPermissionHook(trackingPermissionMethods);
