import { requireNativeModule } from 'expo-modules-core';
import type { PermissionResponse } from 'expo-modules-core';
import type {
  IDialogEventResult,
  IOpenEventPresentationOptions,
  IPresentationOptions,
  IRecurringEventOptions,
  ISource,
} from './types';

const EXPO_CALENDAR_NEXT_MODULE_NAME = 'CalendarNext';

// Each class is a real native SharedObject (Kotlin/Swift `Class(...)` registration) - `declare
// class`, matching @symbiote-native/file-system's next/native-module.ts (see its own comment
// for why a plain object type with a `new(...)` signature does not work the same way).
export declare class NativeExpoCalendar {
  readonly id: string;
  readonly title: string;
  /** @platform android */
  readonly name?: string | null;
  readonly source?: ISource;
  /** @platform ios */
  readonly sourceId?: string;
  /** @platform ios */
  readonly type?: string;
  readonly color?: string;
  /** @platform ios */
  readonly entityType?: string;
  readonly allowsModifications: boolean;
  readonly allowedAvailabilities: string[];
  /** @platform android */
  readonly isVisible?: boolean;
  /** @platform android */
  readonly isSynced?: boolean;
  /** @platform android */
  readonly timeZone?: string;
  /** @platform android */
  readonly isPrimary?: boolean;
  /** @platform android */
  readonly allowedReminders?: string[];
  /** @platform android */
  readonly allowedAttendeeTypes?: string[];
  /** @platform android */
  readonly ownerAccount?: string;
  /** @platform android */
  readonly accessLevel?: string;

  listEvents(
    startDate: string | Date,
    endDate: string | Date,
  ): Promise<NativeExpoCalendarEvent[]>;
  /** @platform ios - typed as always-present, guarded at runtime. */
  listReminders(
    startDate: string | Date | null,
    endDate: string | Date | null,
    status: string | null,
  ): Promise<NativeExpoCalendarReminder[]>;
  createEvent(
    record: Record<string, unknown>,
  ): Promise<NativeExpoCalendarEvent>;
  /** @platform ios - typed as always-present, guarded at runtime. */
  createReminder(
    record: Record<string, unknown>,
  ): Promise<NativeExpoCalendarReminder>;
  addEventWithForm(
    options?: Record<string, unknown>,
  ): Promise<IDialogEventResult>;
  update(patch: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}

export declare class NativeExpoCalendarEvent {
  readonly id: string;
  readonly calendarId?: string;
  readonly title?: string;
  readonly location?: string;
  /** @platform ios */
  readonly creationDate?: string;
  /** @platform ios */
  readonly lastModifiedDate?: string;
  readonly timeZone?: string;
  /** @platform android */
  readonly endTimeZone?: string;
  /** @platform ios */
  readonly url?: string;
  readonly notes?: string;
  readonly alarms?: unknown[];
  readonly recurrenceRule?: Record<string, unknown> | null;
  readonly startDate?: string;
  readonly endDate?: string;
  /** @platform ios */
  readonly originalStartDate?: string;
  /** @platform ios */
  readonly isDetached?: boolean;
  readonly allDay: boolean;
  readonly availability?: string;
  readonly status?: string;
  /** @platform ios */
  readonly organizer?: Record<string, unknown>;
  /** @platform android */
  readonly organizerEmail?: string;
  /** @platform android */
  readonly accessLevel?: string;
  /** @platform android */
  readonly guestsCanModify?: boolean;
  /** @platform android */
  readonly guestsCanInviteOthers?: boolean;
  /** @platform android */
  readonly guestsCanSeeGuests?: boolean;
  /** @platform android */
  readonly originalId?: string;
  /** @platform android */
  readonly instanceId?: string;

  /** @platform android - typed as always-present, guarded at runtime. */
  createAttendee(
    record: Record<string, unknown>,
  ): Promise<NativeExpoCalendarAttendee>;
  openInCalendar(
    options?: IOpenEventPresentationOptions | null,
  ): Promise<IDialogEventResult>;
  editInCalendar(
    options?: IPresentationOptions | null,
  ): Promise<IDialogEventResult>;
  getOccurrenceSync(options?: IRecurringEventOptions): NativeExpoCalendarEvent;
  getAttendees(): Promise<NativeExpoCalendarAttendee[]>;
  update(
    patch: Record<string, unknown>,
    nullableFields: string[],
  ): Promise<void>;
  delete(): Promise<void>;
}

/** @platform android - iOS registers this class with no properties or methods. */
export declare class NativeExpoCalendarAttendee {
  constructor(record: Record<string, unknown>);
  readonly id?: string;
  readonly name?: string;
  readonly role?: string;
  readonly status?: string;
  readonly type?: string;
  readonly email?: string;

  update(
    patch: Record<string, unknown>,
    nullableFields: string[],
  ): Promise<void>;
  delete(): Promise<void>;
}

/** @platform ios - Android registers this class with no properties or methods. */
export declare class NativeExpoCalendarReminder {
  constructor(id: string);
  readonly id?: string;
  readonly calendarId?: string;
  readonly title?: string;
  readonly location?: string;
  readonly creationDate?: string;
  readonly lastModifiedDate?: string;
  readonly timeZone?: string;
  readonly url?: string;
  readonly notes?: string;
  readonly alarms?: unknown[];
  readonly recurrenceRule?: Record<string, unknown> | null;
  readonly allDay: boolean;
  readonly startDate?: string;
  readonly dueDate?: string;
  readonly completed: boolean;
  readonly completionDate?: string;

  update(
    patch: Record<string, unknown>,
    nullableFields: string[],
  ): Promise<void>;
  delete(): Promise<void>;
}

export type INativeCalendarNextModule = {
  ExpoCalendar: typeof NativeExpoCalendar;
  ExpoCalendarEvent: typeof NativeExpoCalendarEvent;
  ExpoCalendarAttendee: typeof NativeExpoCalendarAttendee;
  ExpoCalendarReminder: typeof NativeExpoCalendarReminder;

  getCalendars(type: string | null): Promise<NativeExpoCalendar[]>;
  getCalendarById(id: string): Promise<NativeExpoCalendar>;
  createCalendar(record: Record<string, unknown>): Promise<NativeExpoCalendar>;
  listEvents(
    calendarIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<NativeExpoCalendarEvent[]>;
  getEventById(id: string): Promise<NativeExpoCalendarEvent>;
  getCalendarPermissions(writeOnly?: boolean): Promise<PermissionResponse>;
  requestCalendarPermissions(writeOnly?: boolean): Promise<PermissionResponse>;

  /** @platform ios */
  getDefaultCalendarSync?(): NativeExpoCalendar;
  /** @platform ios */
  presentPicker?(): Promise<NativeExpoCalendar | null>;
  /** @platform ios */
  getReminderById?(id: string): Promise<NativeExpoCalendarReminder>;
  /** @platform ios */
  getRemindersPermissions?(): Promise<PermissionResponse>;
  /** @platform ios */
  requestRemindersPermissions?(): Promise<PermissionResponse>;
  /** @platform ios */
  getSourcesSync?(): ISource[];
};

export const expoCalendarNext = requireNativeModule<INativeCalendarNextModule>(
  EXPO_CALENDAR_NEXT_MODULE_NAME,
);
