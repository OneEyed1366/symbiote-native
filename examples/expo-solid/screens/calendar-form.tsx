import {
  AlarmMethod,
  Availability,
  DayOfTheWeek,
  EventAccessLevel,
  EventStatus,
  Frequency,
} from '@symbiote-native/calendar/solid';
import type {
  IAlarm,
  IEventInput,
  IRecurrenceRule,
  IReminderInput,
} from '@symbiote-native/calendar/solid';
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

export function TextFormCard(props: ICardProps) {
  return (
    <Card testID="calendar-form-card" title="Event and reminder template">
      <Field
        testID="calendar-title-input"
        label="title"
        value={props.form.title}
        onChange={title => props.setForm({ title })}
      />
      <Field
        testID="calendar-location-input"
        label="location"
        value={props.form.location}
        onChange={location => props.setForm({ location })}
      />
      <Field
        testID="calendar-notes-input"
        label="notes"
        value={props.form.notes}
        onChange={notes => props.setForm({ notes })}
      />
      <ToggleRow
        testID="calendar-all-day-switch"
        label="allDay"
        value={props.form.allDay}
        onChange={allDay => props.setForm({ allDay })}
        color={color}
      />
      <ToggleRow
        testID="calendar-guests-modify-switch"
        label="guestsCanModify (Android)"
        value={props.form.guestsCanModify}
        onChange={guestsCanModify => props.setForm({ guestsCanModify })}
        color={color}
      />
      <ToggleRow
        testID="calendar-guests-invite-switch"
        label="guestsCanInviteOthers (Android)"
        value={props.form.guestsCanInviteOthers}
        onChange={guestsCanInviteOthers => props.setForm({ guestsCanInviteOthers })}
        color={color}
      />
      <ToggleRow
        testID="calendar-guests-see-switch"
        label="guestsCanSeeGuests (Android)"
        value={props.form.guestsCanSeeGuests}
        onChange={guestsCanSeeGuests => props.setForm({ guestsCanSeeGuests })}
        color={color}
      />
    </Card>
  );
}

export function ChoiceFormCard(props: ICardProps) {
  return (
    <Card testID="calendar-choice-card" title="Enums, recurrence and alarm">
      <ChoiceRow
        testID="calendar-availability"
        label="availability"
        options={AVAILABILITIES}
        value={props.form.availability}
        onChange={availability => props.setForm({ availability })}
        color={color}
      />
      <ChoiceRow
        testID="calendar-status"
        label="status"
        options={STATUSES}
        value={props.form.status}
        onChange={status => props.setForm({ status })}
        color={color}
      />
      <ChoiceRow
        testID="calendar-access-level"
        label="accessLevel (Android)"
        options={ACCESS_LEVELS}
        value={props.form.accessLevel}
        onChange={accessLevel => props.setForm({ accessLevel })}
        color={color}
      />
      <ChoiceRow
        testID="calendar-frequency"
        label="recurrenceRule.frequency"
        options={FREQUENCIES}
        value={props.form.frequency}
        onChange={frequency => props.setForm({ frequency })}
        color={color}
      />
      <Field
        testID="calendar-interval-input"
        label="recurrenceRule.interval"
        value={props.form.interval}
        onChange={interval => props.setForm({ interval })}
      />
      <ToggleRow
        testID="calendar-monday-switch"
        label="recurrenceRule.daysOfTheWeek: Monday only"
        value={props.form.isMondayOnly}
        onChange={isMondayOnly => props.setForm({ isMondayOnly })}
        color={color}
      />
      <Field
        testID="calendar-alarm-offset-input"
        label="alarms[0].relativeOffset (minutes)"
        value={props.form.alarmOffset}
        onChange={alarmOffset => props.setForm({ alarmOffset })}
      />
      <ChoiceRow
        testID="calendar-alarm-method"
        label="alarms[0].method (Android)"
        options={ALARM_METHODS}
        value={props.form.alarmMethod}
        onChange={alarmMethod => props.setForm({ alarmMethod })}
        color={color}
      />
    </Card>
  );
}
