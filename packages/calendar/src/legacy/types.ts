import type { PermissionResponse } from 'expo-modules-core';
import type {
  AlarmMethod,
  AttendeeRole,
  AttendeeStatus,
  AttendeeType,
  CalendarAccessLevel,
  CalendarDialogResultActions,
  CalendarType,
  DayOfTheWeek,
  EntityTypes,
  EventAccessLevel,
  EventStatus,
  Frequency,
  MonthOfTheYear,
  SourceType,
  Availability,
} from './enums';

export type { PermissionResponse };

export type IRecurringEventOptions = {
  futureEvents?: boolean;
  instanceStartDate?: string | Date;
};

export type IOrganizer = {
  isCurrentUser: boolean;
  name?: string;
  role: string;
  status: string;
  type: string;
  url?: string;
};

export type ISource = {
  id?: string;
  type: string | SourceType;
  name: string;
  isLocalAccount?: boolean;
};

export type ICalendar = {
  id: string;
  title: string;
  sourceId?: string;
  source: ISource;
  type?: CalendarType;
  color: string;
  entityType?: EntityTypes;
  allowsModifications: boolean;
  allowedAvailabilities: Availability[];
  isPrimary?: boolean;
  name?: string | null;
  ownerAccount?: string;
  timeZone?: string;
  allowedReminders?: AlarmMethod[];
  allowedAttendeeTypes?: AttendeeType[];
  isVisible?: boolean;
  isSynced?: boolean;
  accessLevel?: CalendarAccessLevel;
};

export type IEvent = {
  id: string;
  calendarId: string;
  title: string;
  location: string | null;
  creationDate?: string | Date;
  lastModifiedDate?: string | Date;
  timeZone: string;
  endTimeZone?: string;
  url?: string;
  notes: string;
  alarms: IAlarm[];
  recurrenceRule: IRecurrenceRule | null;
  startDate: string | Date;
  endDate: string | Date;
  originalStartDate?: string | Date;
  isDetached?: boolean;
  allDay: boolean;
  availability: Availability;
  status: EventStatus;
  organizer?: IOrganizer;
  organizerEmail?: string;
  accessLevel?: EventAccessLevel;
  guestsCanModify?: boolean;
  guestsCanInviteOthers?: boolean;
  guestsCanSeeGuests?: boolean;
  originalId?: string;
  instanceId?: string;
};

export type IReminder = {
  id?: string;
  calendarId?: string;
  title?: string;
  location?: string;
  creationDate?: string | Date;
  lastModifiedDate?: string | Date;
  timeZone?: string;
  url?: string;
  notes?: string;
  alarms?: IAlarm[];
  recurrenceRule?: IRecurrenceRule | null;
  startDate?: string | Date;
  dueDate?: string | Date;
  allDay?: boolean;
  completed?: boolean;
  completionDate?: string | Date;
};

export type IAttendee = {
  id?: string;
  isCurrentUser?: boolean;
  name: string;
  role: AttendeeRole;
  status: AttendeeStatus;
  type: AttendeeType;
  url?: string;
  email?: string;
};

export type IAlarmLocation = {
  title?: string;
  proximity?: string;
  radius?: number;
  coords?: { latitude?: number; longitude?: number };
};

export type IAlarm = {
  absoluteDate?: string;
  relativeOffset?: number;
  structuredLocation?: IAlarmLocation;
  method?: AlarmMethod;
};

export type IDaysOfTheWeek = {
  dayOfTheWeek: DayOfTheWeek;
  weekNumber?: number;
};

export type IRecurrenceRule = {
  frequency: Frequency;
  interval?: number;
  endDate?: string | Date;
  occurrence?: number;
  daysOfTheWeek?: IDaysOfTheWeek[];
  daysOfTheMonth?: number[];
  monthsOfTheYear?: MonthOfTheYear[];
  weeksOfTheYear?: number[];
  daysOfTheYear?: number[];
  setPositions?: number[];
};

export type IOpenEventDialogResult = {
  action: Extract<
    CalendarDialogResultActions,
    'done' | 'canceled' | 'deleted' | 'responded'
  >;
};

export type IDialogEventResult = {
  action: Extract<
    CalendarDialogResultActions,
    'done' | 'saved' | 'canceled' | 'deleted'
  >;
  id: string | null;
};

export type IPresentationOptions = {
  startNewActivityTask?: boolean;
};

export type IOpenEventPresentationOptions = IPresentationOptions & {
  allowsEditing?: boolean;
  allowsCalendarPreview?: boolean;
};

export type ICalendarDialogParams = {
  id: string;
  instanceStartDate?: string | Date;
};
