import { UnavailabilityError } from 'expo-modules-core';
import type { PermissionResponse } from 'expo-modules-core';
import { expoCalendarNext } from './native-module';
import type { NativeExpoCalendar } from './native-module';
import type {
  IAddEventWithFormOptions,
  ICalendarInput,
  ICalendarPatch,
  IDialogEventResult,
  IEventInput,
  IReminderInput,
  ISource,
} from './types';
import type { EntityTypes } from './enums';
import { stringifyDateValues, stringifyIfDate } from './utils';
import { ExpoCalendarEvent, upgradeToExpoCalendarEvent } from './event';
import {
  ExpoCalendarReminder,
  upgradeToExpoCalendarReminder,
} from './reminder';

export class ExpoCalendar extends expoCalendarNext.ExpoCalendar {
  override async createEvent(details: IEventInput): Promise<ExpoCalendarEvent> {
    return upgradeToExpoCalendarEvent(
      await super.createEvent(stringifyDateValues(details)),
    );
  }

  /** @platform ios */
  override async createReminder(
    details: IReminderInput,
  ): Promise<ExpoCalendarReminder> {
    if (!super.createReminder) {
      throw new UnavailabilityError('ExpoCalendar', 'createReminder');
    }
    return upgradeToExpoCalendarReminder(
      await super.createReminder(stringifyDateValues(details)),
    );
  }

  override async listEvents(
    startDate: Date,
    endDate: Date,
  ): Promise<ExpoCalendarEvent[]> {
    if (!startDate) {
      throw new Error(
        'listEvents must be called with a startDate (date) to search for events',
      );
    }
    if (!endDate) {
      throw new Error(
        'listEvents must be called with an endDate (date) to search for events',
      );
    }
    const events = await super.listEvents(
      stringifyIfDate(startDate),
      stringifyIfDate(endDate),
    );
    return events.map(upgradeToExpoCalendarEvent);
  }

  /** @platform ios */
  override async listReminders(
    startDate: string | Date | null = null,
    endDate: string | Date | null = null,
    status: string | null = null,
  ): Promise<ExpoCalendarReminder[]> {
    if (!super.listReminders) {
      throw new UnavailabilityError('ExpoCalendar', 'listReminders');
    }
    const reminders = await super.listReminders(startDate, endDate, status);
    return reminders.map(upgradeToExpoCalendarReminder);
  }

  override async update(details: ICalendarPatch): Promise<void> {
    return super.update(stringifyDateValues(details));
  }

  override async addEventWithForm(
    options?: IAddEventWithFormOptions,
  ): Promise<IDialogEventResult> {
    if (!super.addEventWithForm) {
      throw new UnavailabilityError('ExpoCalendar', 'addEventWithForm');
    }
    return super.addEventWithForm(options && stringifyDateValues(options));
  }

  override async delete(): Promise<void> {
    return super.delete();
  }

  static async get(calendarId: string): Promise<ExpoCalendar> {
    return upgradeToExpoCalendar(
      await expoCalendarNext.getCalendarById(calendarId),
    );
  }
}

function isExpoCalendar(value: unknown): value is ExpoCalendar {
  return value instanceof ExpoCalendar;
}

function upgradeToExpoCalendar(native: NativeExpoCalendar): ExpoCalendar {
  Object.setPrototypeOf(native, ExpoCalendar.prototype);
  if (!isExpoCalendar(native)) {
    throw new Error(
      'unreachable - just reassigned the prototype to ExpoCalendar',
    );
  }
  return native;
}

/** @platform ios - Android has no single system-managed default calendar. */
export function getDefaultCalendarSync(): ExpoCalendar {
  if (!expoCalendarNext.getDefaultCalendarSync) {
    throw new UnavailabilityError('Calendar', 'getDefaultCalendarSync');
  }
  return upgradeToExpoCalendar(expoCalendarNext.getDefaultCalendarSync());
}

export async function getCalendars(
  entityType?: EntityTypes,
): Promise<ExpoCalendar[]> {
  if (!expoCalendarNext.getCalendars) {
    throw new UnavailabilityError('Calendar', 'getCalendars');
  }
  const calendars = await expoCalendarNext.getCalendars(entityType ?? null);
  return calendars.map(upgradeToExpoCalendar);
}

export async function createCalendar(
  details: ICalendarInput = {},
): Promise<ExpoCalendar> {
  return upgradeToExpoCalendar(await expoCalendarNext.createCalendar(details));
}

/** @platform ios */
export async function presentPicker(): Promise<ExpoCalendar | null> {
  if (!expoCalendarNext.presentPicker) {
    throw new UnavailabilityError('Calendar', 'presentPicker');
  }
  const calendar = await expoCalendarNext.presentPicker();
  return calendar ? upgradeToExpoCalendar(calendar) : null;
}

/** Searches events across several calendars at once - use `calendar.listEvents()` for one. */
export async function listEvents(
  calendars: (string | ExpoCalendar)[],
  startDate: Date,
  endDate: Date,
): Promise<ExpoCalendarEvent[]> {
  const calendarIds = calendars.map(calendar =>
    typeof calendar === 'string' ? calendar : calendar.id,
  );
  const events = await expoCalendarNext.listEvents(
    calendarIds,
    stringifyIfDate(startDate),
    stringifyIfDate(endDate),
  );
  return events.map(upgradeToExpoCalendarEvent);
}

export async function requestCalendarPermissions(
  writeOnly?: boolean,
): Promise<PermissionResponse> {
  return expoCalendarNext.requestCalendarPermissions(writeOnly);
}

export async function getCalendarPermissions(
  writeOnly?: boolean,
): Promise<PermissionResponse> {
  return expoCalendarNext.getCalendarPermissions(writeOnly);
}

/** @platform ios */
export async function requestRemindersPermissions(): Promise<PermissionResponse> {
  if (!expoCalendarNext.requestRemindersPermissions) {
    throw new UnavailabilityError('Calendar', 'requestRemindersPermissions');
  }
  return expoCalendarNext.requestRemindersPermissions();
}

/** @platform ios */
export async function getRemindersPermissions(): Promise<PermissionResponse> {
  if (!expoCalendarNext.getRemindersPermissions) {
    throw new UnavailabilityError('Calendar', 'getRemindersPermissions');
  }
  return expoCalendarNext.getRemindersPermissions();
}

/** @platform ios - Android has no first-class calendar-sources API. */
export function getSourcesSync(): ISource[] {
  if (!expoCalendarNext.getSourcesSync) {
    throw new UnavailabilityError('Calendar', 'getSourcesSync');
  }
  return expoCalendarNext.getSourcesSync();
}
