import { createPermissionHook } from '@symbiote-native/vue';
import { trackingPermissionMethods } from '../core/tracking-permission-api';
import type { PermissionResponse } from '../core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { Ref } from '@vue/runtime-core';

export type IUseTrackingPermissionsHook = (
  options?: IPermissionHookBehavior,
) => [
  Ref<PermissionResponse | null>,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
];

// Vue twin of `../react`'s `useTrackingPermissions`
export const useTrackingPermissions: IUseTrackingPermissionsHook =
  createPermissionHook(trackingPermissionMethods);
