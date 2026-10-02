import { UnavailabilityError } from 'expo-modules-core';
import { expoCalendar } from './native-module';
import type { IReminder } from './types';
import { stringifyDateValues, stringifyIfDate } from '../core/utils';

export async function getRemindersAsync(
  calendarIds: (string | null)[],
  status: string | null,
  startDate: Date | null,
  endDate: Date | null,
): Promise<IReminder[]> {
  if (!expoCalendar.getRemindersAsync) {
    throw new UnavailabilityError('Calendar', 'getRemindersAsync');
  }
  if (status && !startDate) {
    throw new Error(
      'getRemindersAsync must be called with a startDate (date) to search for reminders',
    );
  }
  if (status && !endDate) {
    throw new Error(
      'getRemindersAsync must be called with an endDate (date) to search for reminders',
    );
  }
  if (!calendarIds || !calendarIds.length) {
    throw new Error(
      'getRemindersAsync must be called with a non-empty array of calendarIds to search',
    );
  }
  return expoCalendar.getRemindersAsync(
    startDate ? stringifyIfDate(startDate) : null,
    endDate ? stringifyIfDate(endDate) : null,
    calendarIds,
    status,
  );
}

export async function getReminderAsync(id: string): Promise<IReminder> {
  if (!expoCalendar.getReminderByIdAsync) {
    throw new UnavailabilityError('Calendar', 'getReminderAsync');
  }
  if (!id) {
    throw new Error(
      'getReminderAsync must be called with an id (string) of the target reminder',
    );
  }
  return expoCalendar.getReminderByIdAsync(id);
}

export async function createReminderAsync(
  calendarId: string | null,
  reminder: IReminder = {},
): Promise<string> {
  if (!expoCalendar.saveReminderAsync) {
    throw new UnavailabilityError('Calendar', 'createReminderAsync');
  }
  const { id: _id, ...details } = reminder;
  return expoCalendar.saveReminderAsync(
    stringifyDateValues({ ...details, calendarId: calendarId ?? undefined }),
  );
}

export async function updateReminderAsync(
  id: string,
  details: IReminder = {},
): Promise<string> {
  if (!expoCalendar.saveReminderAsync) {
    throw new UnavailabilityError('Calendar', 'updateReminderAsync');
  }
  if (!id) {
    throw new Error(
      'updateReminderAsync must be called with an id (string) of the target reminder',
    );
  }
  if (
    Object.hasOwn(details, 'creationDate') ||
    Object.hasOwn(details, 'lastModifiedDate')
  ) {
    console.warn(
      'updateReminderAsync was called with one or more read-only properties, which will not be updated',
    );
  }
  return expoCalendar.saveReminderAsync(
    stringifyDateValues({ ...details, id }),
  );
}

export async function deleteReminderAsync(id: string): Promise<void> {
  if (!expoCalendar.deleteReminderAsync) {
    throw new UnavailabilityError('Calendar', 'deleteReminderAsync');
  }
  if (!id) {
    throw new Error(
      'deleteReminderAsync must be called with an id (string) of the target reminder',
    );
  }
  return expoCalendar.deleteReminderAsync(id);
}
