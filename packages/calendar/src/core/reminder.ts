import { UnavailabilityError } from 'expo-modules-core';
import { expoCalendarNext } from './native-module';
import type { NativeExpoCalendarReminder } from './native-module';
import type { IReminderPatch } from './types';
import { splitNullableFields } from './utils';

const NATIVE_MODULE_NAME = 'Calendar';

/** @platform ios - Android registers this class with no properties or methods. */
export class ExpoCalendarReminder
  extends expoCalendarNext.ExpoCalendarReminder
{
  static async findByIdAsync(id: string): Promise<ExpoCalendarReminder> {
    if (!expoCalendarNext.getReminderById) {
      throw new UnavailabilityError(NATIVE_MODULE_NAME, 'findByIdAsync');
    }
    return upgradeToExpoCalendarReminder(
      await expoCalendarNext.getReminderById(id),
    );
  }

  async updateAsync(patch: IReminderPatch): Promise<void> {
    const { record, nullableFields } = splitNullableFields(patch);
    return this.update(record, nullableFields);
  }

  async deleteAsync(): Promise<void> {
    return this.delete();
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
