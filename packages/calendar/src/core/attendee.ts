import { expoCalendarNext } from './native-module';
import type { NativeExpoCalendarAttendee } from './native-module';
import type { IAttendeePatch } from './types';
import { splitNullableFields } from './utils';

/** @platform android - iOS registers this class with no properties or methods. */
export class ExpoCalendarAttendee
  extends expoCalendarNext.ExpoCalendarAttendee
{
  async updateAsync(patch: IAttendeePatch): Promise<void> {
    const { record, nullableFields } = splitNullableFields(patch);
    return this.update(record, nullableFields);
  }

  async deleteAsync(): Promise<void> {
    return this.delete();
  }
}

function isExpoCalendarAttendee(value: unknown): value is ExpoCalendarAttendee {
  return value instanceof ExpoCalendarAttendee;
}

export function upgradeToExpoCalendarAttendee(
  native: NativeExpoCalendarAttendee,
): ExpoCalendarAttendee {
  Object.setPrototypeOf(native, ExpoCalendarAttendee.prototype);
  if (!isExpoCalendarAttendee(native)) {
    throw new Error(
      'unreachable - just reassigned the prototype to ExpoCalendarAttendee',
    );
  }
  return native;
}
