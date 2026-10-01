import {
  AlarmMethod,
  Availability,
  DayOfTheWeek,
  EventAccessLevel,
  EventStatus,
  Frequency,
} from '@symbiote-native/calendar/vue';
import type {
  IAlarm,
  IEventInput,
  IRecurrenceRule,
  IReminderInput,
} from '@symbiote-native/calendar/vue';

const HOUR_MS = 3_600_000;
export const NO_RECURRENCE = 'no recurrence';

export type IForm = {
  title: string;
  location: string;
  notes: string;
  allDay: boolean;
  availability: Availability;
  status: EventStatus;
  accessLevel: EventAccessLevel;
  frequency: Frequency | typeof NO_RECURRENCE;
  interval: string;
  isMondayOnly: boolean;
  alarmOffset: string;
  alarmMethod: AlarmMethod;
  guestsCanModify: boolean;
  guestsCanInviteOthers: boolean;
  guestsCanSeeGuests: boolean;
};
export type ISetForm = (patch: Partial<IForm>) => void;

export const INITIAL_FORM: IForm = {
  title: 'Symbiote canary event',
  location: 'Somewhere',
  notes: 'Created by the canary',
  allDay: false,
  availability: Availability.BUSY,
  status: EventStatus.CONFIRMED,
  accessLevel: EventAccessLevel.DEFAULT,
  frequency: NO_RECURRENCE,
  interval: '1',
  isMondayOnly: false,
  alarmOffset: '-15',
  alarmMethod: AlarmMethod.DEFAULT,
  guestsCanModify: false,
  guestsCanInviteOthers: false,
  guestsCanSeeGuests: true,
};

function choices<T extends string | number>(values: readonly T[]) {
  return values.map(value => ({ label: String(value), value }));
}

export const AVAILABILITIES = choices(Object.values(Availability));
export const STATUSES = choices(Object.values(EventStatus));
export const ACCESS_LEVELS = choices(Object.values(EventAccessLevel));
export const ALARM_METHODS = choices(Object.values(AlarmMethod));
export const FREQUENCIES = choices([
  NO_RECURRENCE,
  ...Object.values(Frequency),
]);

function numberOr(text: string, fallback: number): number {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? fallback : value;
}

function recurrenceOf(form: IForm): IRecurrenceRule | undefined {
  if (form.frequency === NO_RECURRENCE) {
    return undefined;
  }
  return {
    frequency: form.frequency,
    interval: numberOr(form.interval, 1),
    daysOfTheWeek: form.isMondayOnly
      ? [{ dayOfTheWeek: DayOfTheWeek.Monday }]
      : undefined,
  };
}

function alarmsOf(form: IForm): IAlarm[] {
  return [
    {
      relativeOffset: numberOr(form.alarmOffset, -15),
      method: form.alarmMethod,
    },
  ];
}

export function toEventInput(form: IForm): IEventInput {
  const start = new Date(Date.now() + HOUR_MS);
  return {
    title: form.title,
    location: form.location,
    notes: form.notes,
    startDate: start,
    endDate: new Date(start.getTime() + HOUR_MS),
    allDay: form.allDay,
    availability: form.availability,
    status: form.status,
    accessLevel: form.accessLevel,
    recurrenceRule: recurrenceOf(form),
    alarms: alarmsOf(form),
    guestsCanModify: form.guestsCanModify,
    guestsCanInviteOthers: form.guestsCanInviteOthers,
    guestsCanSeeGuests: form.guestsCanSeeGuests,
  };
}

export function toReminderInput(form: IForm): IReminderInput {
  return {
    title: form.title,
    location: form.location,
    notes: form.notes,
    dueDate: new Date(Date.now() + HOUR_MS),
    allDay: form.allDay,
    recurrenceRule: recurrenceOf(form),
    alarms: alarmsOf(form),
  };
}
