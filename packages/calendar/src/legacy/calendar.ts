import { Platform, UnavailabilityError } from 'expo-modules-core';
import { expoCalendar } from './native-module';
import type {
  IAttendee,
  ICalendar,
  ICalendarDialogParams,
  IDialogEventResult,
  IEvent,
  IOpenEventDialogResult,
  IOpenEventPresentationOptions,
  IPresentationOptions,
  IReminder,
  IRecurringEventOptions,
  ISource,
  PermissionResponse,
} from './types';
import { stringifyDateValues, stringifyIfDate } from '../core/utils';

export async function createEventInCalendarAsync(
  eventData: Omit<Partial<IEvent>, 'id'> = {},
  presentationOptions?: IPresentationOptions,
): Promise<IDialogEventResult> {
  if (!expoCalendar.createEventInCalendarAsync) {
    throw new UnavailabilityError('Calendar', 'createEventInCalendarAsync');
  }
  if ('id' in eventData && eventData.id) {
    console.warn(
      'You attempted to create an event with an id. Event ids are assigned by the system.',
    );
  }
  const params = { ...stringifyDateValues(eventData), ...presentationOptions };
  return expoCalendar.createEventInCalendarAsync(params);
}

export async function openEventInCalendarAsync(
  params: ICalendarDialogParams,
  presentationOptions?: IOpenEventPresentationOptions,
): Promise<IOpenEventDialogResult> {
  if (!expoCalendar.openEventInCalendarAsync) {
    throw new UnavailabilityError('Calendar', 'openEventInCalendarAsync');
  }
  if (!params.id) {
    throw new Error(
      'openEventInCalendarAsync must be called with an id (string) of the target event',
    );
  }
  return expoCalendar.openEventInCalendarAsync({
    ...params,
    ...presentationOptions,
  });
}

export async function editEventInCalendarAsync(
  params: ICalendarDialogParams,
  presentationOptions?: IPresentationOptions,
): Promise<IDialogEventResult> {
  if (!expoCalendar.editEventInCalendarAsync) {
    throw new UnavailabilityError('Calendar', 'editEventInCalendarAsync');
  }
  if (!params.id) {
    throw new Error(
      'editEventInCalendarAsync must be called with an id (string) of the target event',
    );
  }
  return expoCalendar.editEventInCalendarAsync({
    ...params,
    ...presentationOptions,
  });
}

export async function isAvailableAsync(): Promise<boolean> {
  return !!expoCalendar.getCalendarsAsync;
}

export async function getCalendarsAsync(
  entityType?: string,
): Promise<ICalendar[]> {
  if (!expoCalendar.getCalendarsAsync) {
    throw new UnavailabilityError('Calendar', 'getCalendarsAsync');
  }
  return expoCalendar.getCalendarsAsync(entityType ?? null);
}

export async function createCalendarAsync(
  details: Partial<ICalendar> = {},
): Promise<string> {
  if (!expoCalendar.saveCalendarAsync) {
    throw new UnavailabilityError('Calendar', 'createCalendarAsync');
  }
  const newDetails = { ...details, id: undefined };
  return expoCalendar.saveCalendarAsync(stringifyDateValues(newDetails));
}

const ANDROID_READ_ONLY_CALENDAR_FIELDS = [
  'source',
  'color',
  'allowsModifications',
  'allowedAvailabilities',
  'isPrimary',
  'ownerAccount',
  'timeZone',
  'allowedReminders',
  'allowedAttendeeTypes',
  'accessLevel',
];
const IOS_READ_ONLY_CALENDAR_FIELDS = [
  'source',
  'type',
  'entityType',
  'allowsModifications',
  'allowedAvailabilities',
];

export async function updateCalendarAsync(
  id: string,
  details: Partial<ICalendar> = {},
): Promise<string> {
  if (!expoCalendar.saveCalendarAsync) {
    throw new UnavailabilityError('Calendar', 'updateCalendarAsync');
  }
  if (!id) {
    throw new Error(
      'updateCalendarAsync must be called with an id (string) of the target calendar',
    );
  }
  const readOnlyFields =
    Platform.OS === 'android'
      ? ANDROID_READ_ONLY_CALENDAR_FIELDS
      : IOS_READ_ONLY_CALENDAR_FIELDS;
  if (readOnlyFields.some(field => Object.hasOwn(details, field))) {
    console.warn(
      'updateCalendarAsync was called with one or more read-only properties, which will not be updated',
    );
  }
  const newDetails = { ...details, id };
  return expoCalendar.saveCalendarAsync(stringifyDateValues(newDetails));
}

export async function deleteCalendarAsync(id: string): Promise<void> {
  if (!expoCalendar.deleteCalendarAsync) {
    throw new UnavailabilityError('Calendar', 'deleteCalendarAsync');
  }
  if (!id) {
    throw new Error(
      'deleteCalendarAsync must be called with an id (string) of the target calendar',
    );
  }
  return expoCalendar.deleteCalendarAsync(id);
}

export async function getEventsAsync(
  calendarIds: string[],
  startDate: Date,
  endDate: Date,
): Promise<IEvent[]> {
  if (!expoCalendar.getEventsAsync) {
    throw new UnavailabilityError('Calendar', 'getEventsAsync');
  }
  if (!startDate) {
    throw new Error(
      'getEventsAsync must be called with a startDate (date) to search for events',
    );
  }
  if (!endDate) {
    throw new Error(
      'getEventsAsync must be called with an endDate (date) to search for events',
    );
  }
  if (!calendarIds || !calendarIds.length) {
    throw new Error(
      'getEventsAsync must be called with a non-empty array of calendarIds to search',
    );
  }
  return expoCalendar.getEventsAsync(
    stringifyIfDate(startDate),
    stringifyIfDate(endDate),
    calendarIds,
  );
}

export async function getEventAsync(
  id: string,
  recurringEventOptions: IRecurringEventOptions = {},
): Promise<IEvent> {
  if (!expoCalendar.getEventByIdAsync) {
    throw new UnavailabilityError('Calendar', 'getEventAsync');
  }
  if (!id) {
    throw new Error(
      'getEventAsync must be called with an id (string) of the target event',
    );
  }
  if (Platform.OS === 'ios') {
    return expoCalendar.getEventByIdAsync(
      id,
      recurringEventOptions.instanceStartDate,
    );
  }
  return expoCalendar.getEventByIdAsync(id);
}

export async function createEventAsync(
  calendarId: string,
  eventData: Omit<Partial<IEvent>, 'id' | 'organizer'> = {},
): Promise<string> {
  if (!expoCalendar.saveEventAsync) {
    throw new UnavailabilityError('Calendar', 'createEventAsync');
  }
  if (!calendarId) {
    throw new Error(
      'createEventAsync must be called with an id (string) of the target calendar',
    );
  }
  if ('id' in eventData && eventData.id) {
    console.warn(
      'You attempted to create an event with an id. Event ids are assigned by the system.',
    );
  }
  if (Platform.OS === 'android') {
    if (!eventData.startDate) {
      throw new Error('createEventAsync requires a startDate (Date)');
    }
    if (!eventData.endDate) {
      throw new Error('createEventAsync requires an endDate (Date)');
    }
  }
  return expoCalendar.saveEventAsync(
    stringifyDateValues({ ...eventData, calendarId }),
    {},
  );
}

const IOS_READ_ONLY_EVENT_FIELDS = [
  'creationDate',
  'lastModifiedDate',
  'originalStartDate',
  'isDetached',
  'status',
  'organizer',
];

export async function updateEventAsync(
  id: string,
  details: Omit<Partial<IEvent>, 'id'> = {},
  recurringEventOptions: IRecurringEventOptions = {},
): Promise<string> {
  if (!expoCalendar.saveEventAsync) {
    throw new UnavailabilityError('Calendar', 'updateEventAsync');
  }
  if (!id) {
    throw new Error(
      'updateEventAsync must be called with an id (string) of the target event',
    );
  }
  if (
    Platform.OS === 'ios' &&
    IOS_READ_ONLY_EVENT_FIELDS.some(field => Object.hasOwn(details, field))
  ) {
    console.warn(
      'updateEventAsync was called with one or more read-only properties, which will not be updated',
    );
  }
  const { futureEvents = false, instanceStartDate } = recurringEventOptions;
  const newDetails = { ...details, id, instanceStartDate };
  return expoCalendar.saveEventAsync(stringifyDateValues(newDetails), {
    futureEvents,
  });
}

export async function deleteEventAsync(
  id: string,
  recurringEventOptions: IRecurringEventOptions = {},
): Promise<void> {
  if (!expoCalendar.deleteEventAsync) {
    throw new UnavailabilityError('Calendar', 'deleteEventAsync');
  }
  if (!id) {
    throw new Error(
      'deleteEventAsync must be called with an id (string) of the target event',
    );
  }
  const { futureEvents = false, instanceStartDate } = recurringEventOptions;
  return expoCalendar.deleteEventAsync(
    { id, instanceStartDate },
    { futureEvents },
  );
}

export async function getAttendeesForEventAsync(
  id: string,
  recurringEventOptions: IRecurringEventOptions = {},
): Promise<IAttendee[]> {
  if (!expoCalendar.getAttendeesForEventAsync) {
    throw new UnavailabilityError('Calendar', 'getAttendeesForEventAsync');
  }
  if (!id) {
    throw new Error(
      'getAttendeesForEventAsync must be called with an id (string) of the target event',
    );
  }
  const { instanceStartDate } = recurringEventOptions;
  const params = Platform.OS === 'ios' ? { id, instanceStartDate } : id;
  return expoCalendar.getAttendeesForEventAsync(params);
}

export async function createAttendeeAsync(
  eventId: string,
  details: Partial<IAttendee> = {},
): Promise<string> {
  if (!expoCalendar.saveAttendeeForEventAsync) {
    throw new UnavailabilityError('Calendar', 'createAttendeeAsync');
  }
  if (!eventId) {
    throw new Error(
      'createAttendeeAsync must be called with an id (string) of the target event',
    );
  }
  if (!details.email) {
    throw new Error('createAttendeeAsync requires an email (string)');
  }
  if (!details.role) {
    throw new Error('createAttendeeAsync requires a role (string)');
  }
  if (!details.type) {
    throw new Error('createAttendeeAsync requires a type (string)');
  }
  if (!details.status) {
    throw new Error('createAttendeeAsync requires a status (string)');
  }
  return expoCalendar.saveAttendeeForEventAsync(
    { ...details, id: undefined },
    eventId,
  );
}

export async function updateAttendeeAsync(
  id: string,
  details: Partial<IAttendee> = {},
): Promise<string> {
  if (!expoCalendar.saveAttendeeForEventAsync) {
    throw new UnavailabilityError('Calendar', 'updateAttendeeAsync');
  }
  if (!id) {
    throw new Error(
      'updateAttendeeAsync must be called with an id (string) of the target event',
    );
  }
  return expoCalendar.saveAttendeeForEventAsync({ ...details, id }, null);
}

export async function deleteAttendeeAsync(id: string): Promise<void> {
  if (!expoCalendar.deleteAttendeeAsync) {
    throw new UnavailabilityError('Calendar', 'deleteAttendeeAsync');
  }
  if (!id) {
    throw new Error(
      'deleteAttendeeAsync must be called with an id (string) of the target event',
    );
  }
  return expoCalendar.deleteAttendeeAsync(id);
}

export async function getDefaultCalendarAsync(): Promise<ICalendar> {
  if (!expoCalendar.getDefaultCalendarAsync) {
    throw new UnavailabilityError('Calendar', 'getDefaultCalendarAsync');
  }
  return expoCalendar.getDefaultCalendarAsync();
}

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

export async function getSourcesAsync(): Promise<ISource[]> {
  if (!expoCalendar.getSourcesAsync) {
    throw new UnavailabilityError('Calendar', 'getSourcesAsync');
  }
  return expoCalendar.getSourcesAsync();
}

export async function getSourceAsync(id: string): Promise<ISource> {
  if (!expoCalendar.getSourceByIdAsync) {
    throw new UnavailabilityError('Calendar', 'getSourceAsync');
  }
  if (!id) {
    throw new Error(
      'getSourceAsync must be called with an id (string) of the target source',
    );
  }
  return expoCalendar.getSourceByIdAsync(id);
}

/** @platform android */
export function openEventInCalendar(id: string): void {
  if (!expoCalendar.openEventInCalendar) {
    console.warn(
      `openEventInCalendar is not available on platform: ${Platform.OS}`,
    );
    return;
  }
  if (!id) {
    throw new Error(
      'openEventInCalendar must be called with an id (string) of the target event',
    );
  }
  return expoCalendar.openEventInCalendar(id);
}

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
