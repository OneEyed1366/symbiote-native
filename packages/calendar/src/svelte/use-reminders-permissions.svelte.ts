import { createPermissionHook } from '@symbiote-native/svelte/runes/create-permission-hook';
import {
  getRemindersPermissions,
  requestRemindersPermissions,
} from '../core/calendar';
import type { PermissionResponse } from 'expo-modules-core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';

export type IUseRemindersPermissionsResult = {
  readonly status: PermissionResponse | null;
  requestPermission: () => Promise<PermissionResponse>;
  getPermission: () => Promise<PermissionResponse>;
};

const usePermission = createPermissionHook({
  getMethod: getRemindersPermissions,
  requestMethod: requestRemindersPermissions,
});

// Svelte twin of `../react`'s `useRemindersPermissions`
export function useRemindersPermissions(
  behavior?: IPermissionHookBehavior,
): IUseRemindersPermissionsResult {
  return usePermission(behavior);
}
