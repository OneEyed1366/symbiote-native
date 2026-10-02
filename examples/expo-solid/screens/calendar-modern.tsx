import {
  CalendarAccessLevel,
  EntityTypes,
  ExpoCalendar,
  ExpoCalendarAttendee,
  ExpoCalendarEvent,
  ExpoCalendarReminder,
  ReminderStatus,
  createCalendar,
  getCalendarPermissions,
  getCalendars,
  getDefaultCalendarSync,
  getRemindersPermissions,
  getSourcesSync,
  listEvents,
  presentPicker,
  requestCalendarPermissions,
  requestRemindersPermissions,
  useCalendarPermissions,
  useRemindersPermissions,
  AttendeeRole,
  AttendeeStatus,
  AttendeeType,
} from '@symbiote-native/calendar/solid';
import { CallConsole } from '../components/CallConsole';
import { Card, Field, ResultRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { toEventInput, toReminderInput } from './calendar-form';
import type { IForm } from './calendar-form';

const color = lineColorOf(ROUTE_NAME.Calendar);
const DAY_MS = 86_400_000;

export type IIds = { calendarId: string; eventId: string; reminderId: string };
export type ISetIds = (patch: Partial<IIds>) => void;

function need(text: string, label: string): string {
  if (text.trim() === '') {
    throw new Error(`fill the ${label} field first, create or list one above`);
  }
  return text.trim();
}

function calendarSummary(calendar: ExpoCalendar) {
  return {
    id: calendar.id,
    title: calendar.title,
    type: calendar.type,
    entityType: calendar.entityType,
    allowsModifications: calendar.allowsModifications,
    source: calendar.source?.name,
    isPrimary: calendar.isPrimary,
  };
}

function eventSummary(event: ExpoCalendarEvent) {
  return {
    id: event.id,
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    allDay: event.allDay,
    recurrence: event.recurrenceRule?.frequency,
    availability: event.availability,
    status: event.status,
  };
}

function reminderSummary(reminder: ExpoCalendarReminder) {
  return {
    id: reminder.id,
    title: reminder.title,
    dueDate: reminder.dueDate,
    completed: reminder.completed,
  };
}

function PermissionCalls() {
  const [calendarState, requestCalendar] = useCalendarPermissions();
  const [remindersState, requestReminders] = useRemindersPermissions();
  return (
    <>
      <Card testID="calendar-hooks-card" title="Permission hooks">
        <ResultRow
          testID="calendar-hook-calendar"
          label="useCalendarPermissions"
          value={calendarState()?.status ?? 'loading…'}
        />
        <ResultRow
          testID="calendar-hook-reminders"
          label="useRemindersPermissions"
          value={remindersState()?.status ?? 'loading…'}
        />
      </Card>
      <CallConsole
        prefix="calendar-permissions"
        title="Permission calls"
        color={color}
        calls={[
          { label: 'getCalendarPermissions', run: () => getCalendarPermissions() },
          {
            label: 'getCalendarPermissions(writeOnly)',
            run: () => getCalendarPermissions(true),
          },
          { label: 'requestCalendarPermissions', run: () => requestCalendarPermissions() },
          {
            label: 'requestCalendarPermissions(writeOnly)',
            run: () => requestCalendarPermissions(true),
          },
          { label: 'getRemindersPermissions', run: () => getRemindersPermissions() },
          { label: 'requestRemindersPermissions', run: () => requestRemindersPermissions() },
          { label: 'hook request (calendar)', run: () => requestCalendar() },
          { label: 'hook request (reminders)', run: () => requestReminders() },
        ]}
      />
    </>
  );
}

function TopLevelCalls(props: { ids: IIds; setIds: ISetIds }) {
  return (
    <CallConsole
      prefix="calendar-top"
      title="Module functions"
      color={color}
      calls={[
        {
          label: 'getCalendars(event)',
          run: async () => {
            const all = await getCalendars(EntityTypes.EVENT);
            props.setIds({ calendarId: all[0]?.id ?? props.ids.calendarId });
            return all.map(calendarSummary);
          },
        },
        {
          label: 'getCalendars(reminder)',
          run: async () => (await getCalendars(EntityTypes.REMINDER)).map(calendarSummary),
        },
        { label: 'getDefaultCalendarSync', run: async () => calendarSummary(getDefaultCalendarSync()) },
        { label: 'getSourcesSync', run: async () => getSourcesSync() },
        {
          label: 'createCalendar',
          run: async () => {
            const created = await createCalendar({
              title: 'Symbiote Calendar',
              name: 'symbiote',
              color: '#0891b2',
              source: getDefaultCalendarSync().source,
              ownerAccount: 'personal',
              accessLevel: CalendarAccessLevel.OWNER,
            });
            props.setIds({ calendarId: created.id });
            return calendarSummary(created);
          },
        },
        {
          label: 'presentPicker',
          run: async () => {
            const picked = await presentPicker();
            props.setIds({ calendarId: picked?.id ?? props.ids.calendarId });
            return picked && calendarSummary(picked);
          },
        },
        {
          label: 'listEvents(next 30 days)',
          run: async () =>
            (
              await listEvents(
                [need(props.ids.calendarId, 'calendar id')],
                new Date(Date.now() - 7 * DAY_MS),
                new Date(Date.now() + 30 * DAY_MS),
              )
            ).map(eventSummary),
        },
      ]}
    />
  );
}

function CalendarCalls(props: { ids: IIds; setIds: ISetIds; form: IForm }) {
  const calendar = () => ExpoCalendar.get(need(props.ids.calendarId, 'calendar id'));
  return (
    <CallConsole
      prefix="calendar-instance"
      title="ExpoCalendar"
      color={color}
      calls={[
        { label: 'ExpoCalendar.get', run: async () => calendarSummary(await calendar()) },
        {
          label: 'listEvents (this calendar)',
          run: async () =>
            (
              await (await calendar()).listEvents(
                new Date(Date.now() - 7 * DAY_MS),
                new Date(Date.now() + 30 * DAY_MS),
              )
            ).map(eventSummary),
        },
        {
          label: 'listReminders',
          run: async () =>
            (await (await calendar()).listReminders(null, null, ReminderStatus.INCOMPLETE)).map(
              reminderSummary,
            ),
        },
        {
          label: 'createEvent',
          run: async () => {
            const event = await (await calendar()).createEvent(toEventInput(props.form));
            props.setIds({ eventId: event.id });
            return eventSummary(event);
          },
        },
        {
          label: 'createReminder',
          run: async () => {
            const reminder = await (await calendar()).createReminder(toReminderInput(props.form));
            props.setIds({ reminderId: reminder.id ?? '' });
            return reminderSummary(reminder);
          },
        },
        {
          label: 'addEventWithForm',
          run: async () =>
            (await calendar()).addEventWithForm({ title: props.form.title, notes: props.form.notes }),
        },
        {
          label: 'update (calendar)',
          run: async () => (await calendar()).update({ title: `${props.form.title} calendar` }),
        },
        { label: 'delete (calendar)', run: async () => (await calendar()).delete() },
      ]}
    />
  );
}

function EventCalls(props: { ids: IIds; form: IForm }) {
  const event = () => ExpoCalendarEvent.get(need(props.ids.eventId, 'event id'));
  return (
    <CallConsole
      prefix="calendar-event"
      title="ExpoCalendarEvent"
      color={color}
      calls={[
        { label: 'ExpoCalendarEvent.get', run: async () => eventSummary(await event()) },
        {
          label: 'getOccurrenceSync',
          run: async () => eventSummary((await event()).getOccurrenceSync({ futureEvents: true })),
        },
        {
          label: 'getAttendees',
          run: async () =>
            (await (await event()).getAttendees()).map(item => ({
              id: item.id,
              name: item.name,
              email: item.email,
              status: item.status,
            })),
        },
        {
          label: 'createAttendee (Android)',
          run: async () =>
            (await event()).createAttendee({
              name: 'Demo Guest',
              email: 'guest@example.com',
              role: AttendeeRole.REQUIRED,
              status: AttendeeStatus.PENDING,
              type: AttendeeType.PERSON,
            }),
        },
        { label: 'openInCalendar', run: async () => (await event()).openInCalendar({ allowsEditing: true }) },
        { label: 'editInCalendar', run: async () => (await event()).editInCalendar() },
        {
          label: 'update (event)',
          run: async () => (await event()).update({ title: `${props.form.title} (updated)`, location: null }),
        },
        { label: 'delete (event)', run: async () => (await event()).delete() },
      ]}
    />
  );
}

function AttendeeAndReminderCalls(props: { ids: IIds; form: IForm }) {
  const firstAttendee = async (): Promise<ExpoCalendarAttendee> => {
    const [attendee] = await (await ExpoCalendarEvent.get(need(props.ids.eventId, 'event id'))).getAttendees();
    if (attendee === undefined) {
      throw new Error('the event has no attendees, use createAttendee (Android) first');
    }
    return attendee;
  };
  const reminder = () => ExpoCalendarReminder.get(need(props.ids.reminderId, 'reminder id'));
  return (
    <CallConsole
      prefix="calendar-attendee-reminder"
      title="ExpoCalendarAttendee and ExpoCalendarReminder"
      color={color}
      calls={[
        {
          label: 'update (attendee, first)',
          run: async () => (await firstAttendee()).update({ name: 'Renamed Guest' }),
        },
        { label: 'delete (attendee, first)', run: async () => (await firstAttendee()).delete() },
        { label: 'ExpoCalendarReminder.get', run: async () => reminderSummary(await reminder()) },
        {
          label: 'update (reminder)',
          run: async () =>
            (await reminder()).update({ title: `${props.form.title} (updated)`, completed: true }),
        },
        { label: 'delete (reminder)', run: async () => (await reminder()).delete() },
      ]}
    />
  );
}

function IdsCard(props: { ids: IIds; setIds: ISetIds }) {
  return (
    <Card testID="calendar-ids-card" title="Selected ids">
      <Field
        testID="calendar-id-input"
        label="calendar id"
        value={props.ids.calendarId}
        onChange={calendarId => props.setIds({ calendarId })}
      />
      <Field
        testID="calendar-event-id-input"
        label="event id"
        value={props.ids.eventId}
        onChange={eventId => props.setIds({ eventId })}
      />
      <Field
        testID="calendar-reminder-id-input"
        label="reminder id"
        value={props.ids.reminderId}
        onChange={reminderId => props.setIds({ reminderId })}
      />
    </Card>
  );
}

export function ModernCards(props: {
  ids: IIds;
  setIds: ISetIds;
  form: IForm;
}) {
  return (
    <>
      <PermissionCalls />
      <IdsCard ids={props.ids} setIds={props.setIds} />
      <TopLevelCalls ids={props.ids} setIds={props.setIds} />
      <CalendarCalls ids={props.ids} setIds={props.setIds} form={props.form} />
      <EventCalls ids={props.ids} form={props.form} />
      <AttendeeAndReminderCalls ids={props.ids} form={props.form} />
    </>
  );
}
