import { createPermissionHook } from '@symbiote-native/vue';
import {
  getRemindersPermissions,
  requestRemindersPermissions,
} from '../core/calendar';
import type { PermissionResponse } from 'expo-modules-core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { Ref } from '@vue/runtime-core';

export type IUseRemindersPermissionsResult = [
  Ref<PermissionResponse | null>,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
];

const usePermission = createPermissionHook({
  getMethod: getRemindersPermissions,
  requestMethod: requestRemindersPermissions,
});

// Vue twin of `../react`'s `useRemindersPermissions`
export function useRemindersPermissions(
  options?: IPermissionHookBehavior,
): IUseRemindersPermissionsResult {
  return usePermission(options);
}
