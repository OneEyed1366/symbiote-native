import { UnavailabilityError } from 'expo-modules-core';
import { expoCalendarNext } from './native-module';
import type { NativeExpoCalendarEvent } from './native-module';
import type {
  IAttendeeInput,
  IDialogEventResult,
  IEventPatch,
  IOpenEventPresentationOptions,
  IPresentationOptions,
  IRecurringEventOptions,
} from './types';
import { splitNullableFields, stringifyDateValues } from './utils';
import {
  ExpoCalendarAttendee,
  upgradeToExpoCalendarAttendee,
} from './attendee';

const NATIVE_MODULE_NAME = 'Calendar';

export class ExpoCalendarEvent extends expoCalendarNext.ExpoCalendarEvent {
  static async findByIdAsync(id: string): Promise<ExpoCalendarEvent> {
    return upgradeToExpoCalendarEvent(await expoCalendarNext.getEventById(id));
  }

  static async findAllAsync(
    calendarIds: string[],
    startDate: Date,
    endDate: Date,
  ): Promise<ExpoCalendarEvent[]> {
    const events = await expoCalendarNext.listEvents(
      calendarIds,
      startDate.toISOString(),
      endDate.toISOString(),
    );
    return events.map(upgradeToExpoCalendarEvent);
  }

  /** @platform android */
  async createAttendeeAsync(
    input: IAttendeeInput,
  ): Promise<ExpoCalendarAttendee> {
    if (!this.createAttendee) {
      throw new UnavailabilityError(NATIVE_MODULE_NAME, 'createAttendeeAsync');
    }
    return upgradeToExpoCalendarAttendee(await this.createAttendee(input));
  }

  async openInCalendarAsync(
    options?: IOpenEventPresentationOptions,
  ): Promise<IDialogEventResult> {
    return this.openInCalendar(
      options ? stringifyDateValues(options) : undefined,
    );
  }

  async editInCalendarAsync(
    options?: IPresentationOptions,
  ): Promise<IDialogEventResult> {
    return this.editInCalendar(options);
  }

  /** Resolves a single occurrence of a recurring event. */
  getOccurrence(options?: IRecurringEventOptions): ExpoCalendarEvent {
    return upgradeToExpoCalendarEvent(
      this.getOccurrenceSync(
        options ? stringifyDateValues(options) : undefined,
      ),
    );
  }

  async getAttendeesAsync(): Promise<ExpoCalendarAttendee[]> {
    const attendees = await this.getAttendees();
    return attendees.map(upgradeToExpoCalendarAttendee);
  }

  async updateAsync(patch: IEventPatch): Promise<void> {
    const { record, nullableFields } = splitNullableFields(patch);
    return this.update(record, nullableFields);
  }

  async deleteAsync(): Promise<void> {
    return this.delete();
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
