import { createPermissionHook } from '@symbiote-native/react';
import {
  getRemindersPermissions,
  requestRemindersPermissions,
} from '../core/calendar';
import type { PermissionResponse } from 'expo-modules-core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';

export type IUseRemindersPermissionsResult = [
  PermissionResponse | null,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
];

const usePermission = createPermissionHook({
  getMethod: getRemindersPermissions,
  requestMethod: requestRemindersPermissions,
});

// React twin of `expo-calendar`'s `useRemindersPermissions`
export function useRemindersPermissions(
  options?: IPermissionHookBehavior,
): IUseRemindersPermissionsResult {
  return usePermission(options);
}
