import { Platform, UnavailabilityError } from 'expo-modules-core';
import { expoCalendarNext } from './native-module';
import type { NativeExpoCalendarReminder } from './native-module';
import type { IReminderPatch } from './types';
import { getNullableDetailsFields, stringifyDateValues } from './utils';

/** @platform ios - Android registers this class with no properties or methods. */
export class ExpoCalendarReminder
  extends expoCalendarNext.ExpoCalendarReminder
{
  override async update(details: IReminderPatch): Promise<void> {
    if (Platform.OS !== 'ios') {
      throw new UnavailabilityError('ExpoCalendarReminder', 'update');
    }
    return super.update(
      stringifyDateValues(details),
      getNullableDetailsFields(details),
    );
  }

  override async delete(): Promise<void> {
    if (Platform.OS !== 'ios') {
      throw new UnavailabilityError('ExpoCalendarReminder', 'delete');
    }
    return super.delete();
  }

  static async get(reminderId: string): Promise<ExpoCalendarReminder> {
    if (Platform.OS !== 'ios' || !expoCalendarNext.getReminderById) {
      throw new UnavailabilityError('ExpoCalendarReminder', 'get');
    }
    return upgradeToExpoCalendarReminder(
      await expoCalendarNext.getReminderById(reminderId),
    );
  }
}

function isExpoCalendarReminder(value: unknown): value is ExpoCalendarReminder {
  return value instanceof ExpoCalendarReminder;
}

export function upgradeToExpoCalendarReminder(
  native: NativeExpoCalendarReminder,
): ExpoCalendarReminder {
  Object.setPrototypeOf(native, ExpoCalendarReminder.prototype);
  if (!isExpoCalendarReminder(native)) {
    throw new Error(
      'unreachable - just reassigned the prototype to ExpoCalendarReminder',
    );
  }
  return native;
}
