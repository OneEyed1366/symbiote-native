import { UnavailabilityError } from 'expo-modules-core';
import { expoCalendarNext } from './native-module';
import type { NativeExpoCalendarAttendee } from './native-module';
import type { IAttendeePatch } from './types';
import { getNullableDetailsFields, stringifyDateValues } from './utils';

/** @platform android - iOS registers this class with no properties or methods. */
export class ExpoCalendarAttendee
  extends expoCalendarNext.ExpoCalendarAttendee
{
  override async update(details: IAttendeePatch): Promise<void> {
    if (!super.update) {
      throw new UnavailabilityError('ExpoCalendarAttendee', 'update');
    }
    return super.update(
      stringifyDateValues(details),
      getNullableDetailsFields(details),
    );
  }

  override async delete(): Promise<void> {
    if (!super.delete) {
      throw new UnavailabilityError('ExpoCalendarAttendee', 'delete');
    }
    return super.delete();
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
