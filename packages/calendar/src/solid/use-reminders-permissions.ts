import { createPermissionHook } from '@symbiote-native/solid';
import {
  getRemindersPermissions,
  requestRemindersPermissions,
} from '../core/calendar';
import type { PermissionResponse } from 'expo-modules-core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { Accessor } from 'solid-js';

export type IUseRemindersPermissionsResult = [
  Accessor<PermissionResponse | null>,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
];

const usePermission = createPermissionHook({
  getMethod: getRemindersPermissions,
  requestMethod: requestRemindersPermissions,
});

// Solid twin of `../react`'s `useRemindersPermissions`
export function useRemindersPermissions(
  options?: IPermissionHookBehavior,
): IUseRemindersPermissionsResult {
  return usePermission(options);
}
