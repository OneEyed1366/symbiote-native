import { requireNativeModule } from 'expo-modules-core';
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
  ISource,
  PermissionResponse,
} from './types';

const EXPO_CALENDAR_MODULE_NAME = 'ExpoCalendar';

export type INativeCalendarModule = {
  createEventInCalendarAsync?(
    params: Record<string, unknown>,
  ): Promise<IDialogEventResult>;
  openEventInCalendarAsync?(
    params: ICalendarDialogParams & IOpenEventPresentationOptions,
  ): Promise<IOpenEventDialogResult>;
  editEventInCalendarAsync?(
    params: ICalendarDialogParams & IPresentationOptions,
  ): Promise<IDialogEventResult>;
  getCalendarsAsync?(entityType: string | null): Promise<ICalendar[]>;
  saveCalendarAsync?(details: Record<string, unknown>): Promise<string>;
  deleteCalendarAsync?(id: string): Promise<void>;
  getEventsAsync?(
    startDate: string | Date,
    endDate: string | Date,
    calendarIds: string[],
  ): Promise<IEvent[]>;
  getEventByIdAsync?(
    id: string,
    instanceStartDate?: string | Date,
  ): Promise<IEvent>;
  saveEventAsync?(
    details: Record<string, unknown>,
    options: { futureEvents?: boolean },
  ): Promise<string>;
  deleteEventAsync?(
    params: { id: string; instanceStartDate?: string | Date },
    options: { futureEvents?: boolean },
  ): Promise<void>;
  getAttendeesForEventAsync?(
    params: { id: string; instanceStartDate?: string | Date } | string,
  ): Promise<IAttendee[]>;
  saveAttendeeForEventAsync?(
    details: Record<string, unknown>,
    eventId: string | null,
  ): Promise<string>;
  deleteAttendeeAsync?(id: string): Promise<void>;
  getDefaultCalendarAsync?(): Promise<ICalendar>;
  getRemindersAsync?(
    startDate: string | Date | null,
    endDate: string | Date | null,
    calendarIds: (string | null)[],
    status: string | null,
  ): Promise<IReminder[]>;
  getReminderByIdAsync?(id: string): Promise<IReminder>;
  saveReminderAsync?(details: Record<string, unknown>): Promise<string>;
  deleteReminderAsync?(id: string): Promise<void>;
  getSourcesAsync?(): Promise<ISource[]>;
  getSourceByIdAsync?(id: string): Promise<ISource>;
  openEventInCalendar?(id: string): void;
  getCalendarPermissionsAsync?(): Promise<PermissionResponse>;
  requestCalendarPermissionsAsync?(): Promise<PermissionResponse>;
  getRemindersPermissionsAsync?(): Promise<PermissionResponse>;
  requestRemindersPermissionsAsync?(): Promise<PermissionResponse>;
};

export const expoCalendar = requireNativeModule<INativeCalendarModule>(
  EXPO_CALENDAR_MODULE_NAME,
);
