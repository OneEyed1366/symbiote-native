import {
  AlarmMethod,
  Availability,
  DayOfTheWeek,
  EventAccessLevel,
  EventStatus,
  Frequency,
} from '@symbiote-native/calendar';
import type {
  IAlarm,
  IEventInput,
  IRecurrenceRule,
  IReminderInput,
} from '@symbiote-native/calendar';
import {
  Card,
  ChoiceRow,
  Field,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Calendar);
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

const AVAILABILITIES = choices(Object.values(Availability));
const STATUSES = choices(Object.values(EventStatus));
const ACCESS_LEVELS = choices(Object.values(EventAccessLevel));
const ALARM_METHODS = choices(Object.values(AlarmMethod));
const FREQUENCIES = choices([NO_RECURRENCE, ...Object.values(Frequency)]);

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
    { relativeOffset: numberOr(form.alarmOffset, -15), method: form.alarmMethod },
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

type ICardProps = { form: IForm; setForm: ISetForm };

export function TextFormCard({ form, setForm }: ICardProps) {
  return (
    <Card testID="calendar-form-card" title="Event and reminder template">
      <Field
        testID="calendar-title-input"
        label="title"
        value={form.title}
        onChange={title => setForm({ title })}
      />
      <Field
        testID="calendar-location-input"
        label="location"
        value={form.location}
        onChange={location => setForm({ location })}
      />
      <Field
        testID="calendar-notes-input"
        label="notes"
        value={form.notes}
        onChange={notes => setForm({ notes })}
      />
      <ToggleRow
        testID="calendar-all-day-switch"
        label="allDay"
        value={form.allDay}
        onChange={allDay => setForm({ allDay })}
        color={color}
      />
      <ToggleRow
        testID="calendar-guests-modify-switch"
        label="guestsCanModify (Android)"
        value={form.guestsCanModify}
        onChange={guestsCanModify => setForm({ guestsCanModify })}
        color={color}
      />
      <ToggleRow
        testID="calendar-guests-invite-switch"
        label="guestsCanInviteOthers (Android)"
        value={form.guestsCanInviteOthers}
        onChange={guestsCanInviteOthers => setForm({ guestsCanInviteOthers })}
        color={color}
      />
      <ToggleRow
        testID="calendar-guests-see-switch"
        label="guestsCanSeeGuests (Android)"
        value={form.guestsCanSeeGuests}
        onChange={guestsCanSeeGuests => setForm({ guestsCanSeeGuests })}
        color={color}
      />
    </Card>
  );
}

export function ChoiceFormCard({ form, setForm }: ICardProps) {
  return (
    <Card testID="calendar-choice-card" title="Enums, recurrence and alarm">
      <ChoiceRow
        testID="calendar-availability"
        label="availability"
        options={AVAILABILITIES}
        value={form.availability}
        onChange={availability => setForm({ availability })}
        color={color}
      />
      <ChoiceRow
        testID="calendar-status"
        label="status"
        options={STATUSES}
        value={form.status}
        onChange={status => setForm({ status })}
        color={color}
      />
      <ChoiceRow
        testID="calendar-access-level"
        label="accessLevel (Android)"
        options={ACCESS_LEVELS}
        value={form.accessLevel}
        onChange={accessLevel => setForm({ accessLevel })}
        color={color}
      />
      <ChoiceRow
        testID="calendar-frequency"
        label="recurrenceRule.frequency"
        options={FREQUENCIES}
        value={form.frequency}
        onChange={frequency => setForm({ frequency })}
        color={color}
      />
      <Field
        testID="calendar-interval-input"
        label="recurrenceRule.interval"
        value={form.interval}
        onChange={interval => setForm({ interval })}
      />
      <ToggleRow
        testID="calendar-monday-switch"
        label="recurrenceRule.daysOfTheWeek: Monday only"
        value={form.isMondayOnly}
        onChange={isMondayOnly => setForm({ isMondayOnly })}
        color={color}
      />
      <Field
        testID="calendar-alarm-offset-input"
        label="alarms[0].relativeOffset (minutes)"
        value={form.alarmOffset}
        onChange={alarmOffset => setForm({ alarmOffset })}
      />
      <ChoiceRow
        testID="calendar-alarm-method"
        label="alarms[0].method (Android)"
        options={ALARM_METHODS}
        value={form.alarmMethod}
        onChange={alarmMethod => setForm({ alarmMethod })}
        color={color}
      />
    </Card>
  );
}
