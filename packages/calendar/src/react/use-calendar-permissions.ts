import { createPermissionHook } from '@symbiote-native/react';
import {
  calendarPermissionMethods,
  splitCalendarPermissionOptions,
  type ICalendarPermissionMethodOptions,
} from '../core/calendar-permission-api';
import type { PermissionResponse } from 'expo-modules-core';
import type { IPermissionHookOptions } from '@symbiote-native/engine';

export type IUseCalendarPermissionsOptions = ICalendarPermissionMethodOptions;

export type IUseCalendarPermissionsResult = [
  PermissionResponse | null,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
];

const usePermission = createPermissionHook(calendarPermissionMethods);

// React twin of `expo-calendar`'s `useCalendarPermissions`
export function useCalendarPermissions(
  options?: IPermissionHookOptions<IUseCalendarPermissionsOptions>,
): IUseCalendarPermissionsResult {
  return usePermission(...splitCalendarPermissionOptions(options));
}
