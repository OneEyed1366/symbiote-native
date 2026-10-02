import { createPermissionHook } from '@symbiote-native/svelte/runes/create-permission-hook';
import {
  calendarPermissionMethods,
  splitCalendarPermissionOptions,
  type ICalendarPermissionMethodOptions,
} from '../core/calendar-permission-api';
import type { PermissionResponse } from 'expo-modules-core';
import type { IPermissionHookOptions } from '@symbiote-native/engine';

export type IUseCalendarPermissionsOptions = ICalendarPermissionMethodOptions;

export type IUseCalendarPermissionsResult = {
  readonly status: PermissionResponse | null;
  requestPermission: () => Promise<PermissionResponse>;
  getPermission: () => Promise<PermissionResponse>;
};

const usePermission = createPermissionHook(calendarPermissionMethods);

// Svelte twin of `../react`'s `useCalendarPermissions`
export function useCalendarPermissions(
  options?: IPermissionHookOptions<IUseCalendarPermissionsOptions>,
): IUseCalendarPermissionsResult {
  return usePermission(...splitCalendarPermissionOptions(options));
}
