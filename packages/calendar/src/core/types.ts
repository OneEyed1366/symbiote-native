import type {
  AlarmMethod,
  AttendeeRole,
  AttendeeStatus,
  AttendeeType,
  CalendarAccessLevel,
  CalendarDialogResultActions,
  DayOfTheWeek,
  Frequency,
  MonthOfTheYear,
} from './enums';

export type ISource = {
  id?: string;
  type?: string;
  name?: string;
  isLocalAccount?: boolean;
};

export type IDaysOfTheWeek = {
  dayOfTheWeek: DayOfTheWeek;
  /** `-53` to `53`; `0` ignores this field. */
  weekNumber?: number;
};

export type IRecurrenceRule = {
  frequency: Frequency;
  /** @default 1 */
  interval?: number;
  endDate?: string | Date | null;
  occurrence?: number | null;
  /** @platform ios */
  daysOfTheWeek?: IDaysOfTheWeek[] | null;
  /** @platform ios */
  daysOfTheMonth?: number[] | null;
  /** @platform ios */
  monthsOfTheYear?: MonthOfTheYear[] | null;
  /** @platform ios */
  weeksOfTheYear?: number[] | null;
  /** @platform ios */
  daysOfTheYear?: number[] | null;
  /** @platform ios */
  setPositions?: number[] | null;
};

export type IAlarmLocation = {
  title?: string;
  proximity?: string;
  radius?: number;
  coords?: { latitude?: number; longitude?: number };
};

export type IAlarm = {
  /** @platform ios */
  absoluteDate?: string;
  relativeOffset?: number;
  structuredLocation?: IAlarmLocation;
  /** @platform android */
  method?: AlarmMethod;
};

/** Fields for `createCalendar()` - all optional, matches upstream's `Partial<Calendar>`. */
export type ICalendarInput = {
  title?: string;
  /** @platform android */
  name?: string;
  source?: ISource;
  color?: string;
  /** @platform android */
  isVisible?: boolean;
  /** @platform android */
  isSynced?: boolean;
  /** @platform android */
  timeZone?: string;
  /** @platform android */
  isPrimary?: boolean;
  allowedAvailabilities?: string[];
  /** @platform android */
  allowedReminders?: AlarmMethod[];
  /** @platform android */
  allowedAttendeeTypes?: AttendeeType[];
  /** @platform android */
  ownerAccount?: string;
  /** @platform android */
  accessLevel?: CalendarAccessLevel;
  /** @platform ios */
  sourceId?: string;
};

/** Fields for `calendar.update()`; a field set to `null` clears it natively. */
export type ICalendarPatch = {
  title?: string | null;
  /** @platform android */
  name?: string | null;
  color?: string | null;
  /** @platform android */
  isVisible?: boolean | null;
  /** @platform android */
  isSynced?: boolean | null;
  /** @platform android */
  timeZone?: string | null;
};

/** Fields for `calendar.createEvent()` - all optional, matches upstream's `Omit<Partial<...>>`. */
export type IEventInput = {
  startDate?: string | Date;
  endDate?: string | Date;
  title?: string;
  location?: string;
  timeZone?: string;
  /** @platform android */
  endTimeZone?: string;
  notes?: string;
  alarms?: IAlarm[];
  recurrenceRule?: IRecurrenceRule;
  allDay?: boolean;
  availability?: string;
  /** @platform android */
  status?: string;
  /** @platform android */
  organizerEmail?: string;
  /** @platform android */
  accessLevel?: string;
  /** @platform android */
  guestsCanModify?: boolean;
  /** @platform android */
  guestsCanInviteOthers?: boolean;
  /** @platform android */
  guestsCanSeeGuests?: boolean;
};

/** Fields for `event.update()`; a field set to `null` clears it natively. */
export type IEventPatch = Partial<{
  [K in keyof IEventInput]: IEventInput[K] | null;
}>;

/** Fields for `event.createAttendee()`. @platform android */
export type IAttendeeInput = {
  name: string;
  role: AttendeeRole;
  status: AttendeeStatus;
  type: AttendeeType;
  email: string;
};

/** Fields for `attendee.update()`. @platform android */
export type IAttendeePatch = Partial<{
  [K in keyof IAttendeeInput]: IAttendeeInput[K] | null;
}>;

/** Fields for `calendar.createReminder()`. @platform ios */
export type IReminderInput = {
  title?: string;
  location?: string;
  notes?: string;
  startDate?: string | Date;
  dueDate?: string | Date;
  completionDate?: string | Date;
  timeZone?: string;
  alarms?: IAlarm[];
  recurrenceRule?: IRecurrenceRule;
  url?: string;
  allDay?: boolean;
  completed?: boolean;
};

/** Fields for `reminder.update()`; a field set to `null` clears it natively. @platform ios */
export type IReminderPatch = Partial<{
  [K in keyof IReminderInput]: IReminderInput[K] | null;
}>;

export type IRecurringEventOptions = {
  /** Applies to `instanceStartDate` and every future occurrence when `true`. */
  futureEvents?: boolean;
  instanceStartDate?: string | Date;
};

export type IPresentationOptions = {
  /** `true` resolves `'done'` right after opening. @default true @platform android */
  startNewActivityTask?: boolean;
};

export type IOpenEventPresentationOptions = IPresentationOptions & {
  /** @default false @platform ios */
  allowsEditing?: boolean;
  /** @default false @platform ios */
  allowsCalendarPreview?: boolean;
};

/** Fields for `calendar.addEventWithForm()`. */
export type IAddEventWithFormOptions = {
  title?: string;
  location?: string;
  notes?: string;
  url?: string;
  /** @platform android */
  timeZone?: string;
  availability?: string;
  allDay?: boolean;
  startDate?: string | Date;
  endDate?: string | Date;
  recurrenceRule?: IRecurrenceRule;
  alarms?: IAlarm[];
} & IPresentationOptions;

export type IDialogEventResult = {
  action: CalendarDialogResultActions;
  id?: string | null;
};
