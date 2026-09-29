import { createPermissionHook } from '@symbiote-native/solid';
import {
  calendarPermissionMethods,
  splitCalendarPermissionOptions,
  type ICalendarPermissionMethodOptions,
} from '../core/calendar-permission-api';
import type { PermissionResponse } from 'expo-modules-core';
import type { IPermissionHookOptions } from '@symbiote-native/engine';
import type { Accessor } from 'solid-js';

export type IUseCalendarPermissionsOptions = ICalendarPermissionMethodOptions;

export type IUseCalendarPermissionsResult = [
  Accessor<PermissionResponse | null>,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
];

const usePermission = createPermissionHook(calendarPermissionMethods);

// Solid twin of `../react`'s `useCalendarPermissions`
export function useCalendarPermissions(
  options?: IPermissionHookOptions<IUseCalendarPermissionsOptions>,
): IUseCalendarPermissionsResult {
  return usePermission(...splitCalendarPermissionOptions(options));
}
