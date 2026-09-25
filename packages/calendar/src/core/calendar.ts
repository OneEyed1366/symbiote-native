import { UnavailabilityError } from 'expo-modules-core';
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
import { EntityTypes } from './enums';
import { splitNullableFields, stringifyDateValues } from './utils';
import { ExpoCalendarEvent, upgradeToExpoCalendarEvent } from './event';
import {
  ExpoCalendarReminder,
  upgradeToExpoCalendarReminder,
} from './reminder';

const NATIVE_MODULE_NAME = 'Calendar';

// Cannot use `static` keyword in class declaration - matches @symbiote-native/file-system's
// next/file.ts, which cites a runtime error on classes extending a native SharedObject.
export class ExpoCalendar extends expoCalendarNext.ExpoCalendar {
  static getAllAsync: (entityType?: EntityTypes) => Promise<ExpoCalendar[]>;
  static getByIdAsync: (id: string) => Promise<ExpoCalendar>;
  static createAsync: (input: ICalendarInput) => Promise<ExpoCalendar>;
  static getDefaultSync: () => ExpoCalendar;
  static presentPickerAsync: () => Promise<ExpoCalendar | null>;
  static getSourcesSync: () => ISource[];

  async listEventsAsync(
    startDate: Date,
    endDate: Date,
  ): Promise<ExpoCalendarEvent[]> {
    const events = await this.listEvents(
      startDate.toISOString(),
      endDate.toISOString(),
    );
    return events.map(upgradeToExpoCalendarEvent);
  }

  /** @platform ios */
  async listRemindersAsync(
    startDate?: Date | null,
    endDate?: Date | null,
    status?: string | null,
  ): Promise<ExpoCalendarReminder[]> {
    if (!this.listReminders) {
      throw new UnavailabilityError(NATIVE_MODULE_NAME, 'listRemindersAsync');
    }
    const reminders = await this.listReminders(
      startDate ? startDate.toISOString() : null,
      endDate ? endDate.toISOString() : null,
      status ?? null,
    );
    return reminders.map(upgradeToExpoCalendarReminder);
  }

  async createEventAsync(input: IEventInput): Promise<ExpoCalendarEvent> {
    return upgradeToExpoCalendarEvent(
      await this.createEvent(stringifyDateValues(input)),
    );
  }

  /** @platform ios */
  async createReminderAsync(
    input: IReminderInput,
  ): Promise<ExpoCalendarReminder> {
    if (!this.createReminder) {
      throw new UnavailabilityError(NATIVE_MODULE_NAME, 'createReminderAsync');
    }
    return upgradeToExpoCalendarReminder(
      await this.createReminder(stringifyDateValues(input)),
    );
  }

  async addEventWithFormAsync(
    options?: IAddEventWithFormOptions,
  ): Promise<IDialogEventResult> {
    return this.addEventWithForm(
      options ? stringifyDateValues(options) : undefined,
    );
  }

  async updateAsync(patch: ICalendarPatch): Promise<void> {
    const { record } = splitNullableFields(patch);
    return this.update(record);
  }

  async deleteAsync(): Promise<void> {
    return this.delete();
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

ExpoCalendar.getAllAsync = async function getAllAsync(
  entityType?: EntityTypes,
): Promise<ExpoCalendar[]> {
  const calendars = await expoCalendarNext.getCalendars(entityType ?? null);
  return calendars.map(upgradeToExpoCalendar);
};

ExpoCalendar.getByIdAsync = async function getByIdAsync(
  id: string,
): Promise<ExpoCalendar> {
  return upgradeToExpoCalendar(await expoCalendarNext.getCalendarById(id));
};

ExpoCalendar.createAsync = async function createAsync(
  input: ICalendarInput,
): Promise<ExpoCalendar> {
  return upgradeToExpoCalendar(await expoCalendarNext.createCalendar(input));
};

ExpoCalendar.getDefaultSync = function getDefaultSync(): ExpoCalendar {
  if (!expoCalendarNext.getDefaultCalendarSync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getDefaultSync');
  }
  return upgradeToExpoCalendar(expoCalendarNext.getDefaultCalendarSync());
};

ExpoCalendar.presentPickerAsync =
  async function presentPickerAsync(): Promise<ExpoCalendar | null> {
    if (!expoCalendarNext.presentPicker) {
      throw new UnavailabilityError(NATIVE_MODULE_NAME, 'presentPickerAsync');
    }
    const native = await expoCalendarNext.presentPicker();
    return native ? upgradeToExpoCalendar(native) : null;
  };

ExpoCalendar.getSourcesSync = function getSourcesSync(): ISource[] {
  if (!expoCalendarNext.getSourcesSync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getSourcesSync');
  }
  return expoCalendarNext.getSourcesSync();
};
