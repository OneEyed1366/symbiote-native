import { UnavailabilityError } from 'expo-modules-core';
import { expoCalendar } from './native-module';
import type { PermissionResponse } from './types';

export async function getCalendarPermissionsAsync(): Promise<PermissionResponse> {
  if (!expoCalendar.getCalendarPermissionsAsync) {
    throw new UnavailabilityError('Calendar', 'getCalendarPermissionsAsync');
  }
  return expoCalendar.getCalendarPermissionsAsync();
}

/** @platform ios */
export async function getRemindersPermissionsAsync(): Promise<PermissionResponse> {
  if (!expoCalendar.getRemindersPermissionsAsync) {
    throw new UnavailabilityError('Calendar', 'getRemindersPermissionsAsync');
  }
  return expoCalendar.getRemindersPermissionsAsync();
}

export async function requestCalendarPermissionsAsync(): Promise<PermissionResponse> {
  if (!expoCalendar.requestCalendarPermissionsAsync) {
    throw new UnavailabilityError(
      'Calendar',
      'requestCalendarPermissionsAsync',
    );
  }
  return expoCalendar.requestCalendarPermissionsAsync();
}

/** @deprecated Use `requestCalendarPermissionsAsync` instead */
export async function requestPermissionsAsync(): Promise<PermissionResponse> {
  console.warn(
    'requestPermissionsAsync is deprecated. Use requestCalendarPermissionsAsync instead.',
  );
  return requestCalendarPermissionsAsync();
}

/** @platform ios */
export async function requestRemindersPermissionsAsync(): Promise<PermissionResponse> {
  if (!expoCalendar.requestRemindersPermissionsAsync) {
    throw new UnavailabilityError(
      'Calendar',
      'requestRemindersPermissionsAsync',
    );
  }
  return expoCalendar.requestRemindersPermissionsAsync();
}
