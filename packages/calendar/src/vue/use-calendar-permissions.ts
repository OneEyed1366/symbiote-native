import { createPermissionHook } from '@symbiote-native/vue';
import {
  calendarPermissionMethods,
  splitCalendarPermissionOptions,
  type ICalendarPermissionMethodOptions,
} from '../core/calendar-permission-api';
import type { PermissionResponse } from 'expo-modules-core';
import type { IPermissionHookOptions } from '@symbiote-native/engine';
import type { Ref } from '@vue/runtime-core';

export type IUseCalendarPermissionsOptions = ICalendarPermissionMethodOptions;

export type IUseCalendarPermissionsResult = [
  Ref<PermissionResponse | null>,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
];

const usePermission = createPermissionHook(calendarPermissionMethods);

// Vue twin of `../react`'s `useCalendarPermissions`
export function useCalendarPermissions(
  options?: IPermissionHookOptions<IUseCalendarPermissionsOptions>,
): IUseCalendarPermissionsResult {
  return usePermission(...splitCalendarPermissionOptions(options));
}
