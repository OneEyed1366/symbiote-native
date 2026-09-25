import { UnavailabilityError } from 'expo-modules-core';
import type { PermissionResponse } from 'expo-modules-core';
import { expoCalendarNext } from './native-module';

const NATIVE_MODULE_NAME = 'Calendar';

export async function getCalendarPermissionsAsync(
  writeOnly?: boolean,
): Promise<PermissionResponse> {
  return expoCalendarNext.getCalendarPermissions(writeOnly);
}

export async function requestCalendarPermissionsAsync(
  writeOnly?: boolean,
): Promise<PermissionResponse> {
  return expoCalendarNext.requestCalendarPermissions(writeOnly);
}

/** @platform ios */
export async function getRemindersPermissionsAsync(): Promise<PermissionResponse> {
  if (!expoCalendarNext.getRemindersPermissions) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'getRemindersPermissionsAsync',
    );
  }
  return expoCalendarNext.getRemindersPermissions();
}

/** @platform ios */
export async function requestRemindersPermissionsAsync(): Promise<PermissionResponse> {
  if (!expoCalendarNext.requestRemindersPermissions) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'requestRemindersPermissionsAsync',
    );
  }
  return expoCalendarNext.requestRemindersPermissions();
}
