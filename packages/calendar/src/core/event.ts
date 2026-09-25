import { UnavailabilityError } from 'expo-modules-core';
import { expoCalendarNext } from './native-module';
import type { NativeExpoCalendarEvent } from './native-module';
import type {
  IAttendeeInput,
  IEventPatch,
  IRecurringEventOptions,
} from './types';
import { getNullableDetailsFields, stringifyDateValues } from './utils';
import {
  ExpoCalendarAttendee,
  upgradeToExpoCalendarAttendee,
} from './attendee';

export class ExpoCalendarEvent extends expoCalendarNext.ExpoCalendarEvent {
  override getOccurrenceSync(
    options: IRecurringEventOptions = {},
  ): ExpoCalendarEvent {
    const occurrence = super.getOccurrenceSync(stringifyDateValues(options));
    return upgradeToExpoCalendarEvent(occurrence);
  }

  override async getAttendees(): Promise<ExpoCalendarAttendee[]> {
    const attendees = await super.getAttendees();
    return attendees.map(upgradeToExpoCalendarAttendee);
  }

  /** @platform android */
  override async createAttendee(
    attendee: IAttendeeInput,
  ): Promise<ExpoCalendarAttendee> {
    if (!super.createAttendee) {
      throw new UnavailabilityError('ExpoCalendarEvent', 'createAttendee');
    }
    return upgradeToExpoCalendarAttendee(await super.createAttendee(attendee));
  }

  override async update(details: IEventPatch): Promise<void> {
    return super.update(
      stringifyDateValues(details),
      getNullableDetailsFields(details),
    );
  }

  override async delete(): Promise<void> {
    return super.delete();
  }

  static async get(eventId: string): Promise<ExpoCalendarEvent> {
    return upgradeToExpoCalendarEvent(
      await expoCalendarNext.getEventById(eventId),
    );
  }
}

function isExpoCalendarEvent(value: unknown): value is ExpoCalendarEvent {
  return value instanceof ExpoCalendarEvent;
}

export function upgradeToExpoCalendarEvent(
  native: NativeExpoCalendarEvent,
): ExpoCalendarEvent {
  Object.setPrototypeOf(native, ExpoCalendarEvent.prototype);
  if (!isExpoCalendarEvent(native)) {
    throw new Error(
      'unreachable - just reassigned the prototype to ExpoCalendarEvent',
    );
  }
  return native;
}
