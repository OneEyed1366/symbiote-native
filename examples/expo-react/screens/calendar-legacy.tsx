import { useState } from 'react';
import {
  EntityTypes,
  ReminderStatus,
  createAttendeeAsync,
  createCalendarAsync,
  createEventAsync,
  createEventInCalendarAsync,
  createReminderAsync,
  deleteAttendeeAsync,
  deleteCalendarAsync,
  deleteEventAsync,
  deleteReminderAsync,
  editEventInCalendarAsync,
  getAttendeesForEventAsync,
  getCalendarPermissionsAsync,
  getCalendarsAsync,
  getDefaultCalendarAsync,
  getEventAsync,
  getEventsAsync,
  getReminderAsync,
  getRemindersAsync,
  getRemindersPermissionsAsync,
  getSourceAsync,
  getSourcesAsync,
  isAvailableAsync,
  openEventInCalendar,
  openEventInCalendarAsync,
  requestCalendarPermissionsAsync,
  requestPermissionsAsync,
  requestRemindersPermissionsAsync,
  updateAttendeeAsync,
  updateCalendarAsync,
  updateEventAsync,
  updateReminderAsync,
  AttendeeRole,
  AttendeeStatus,
  AttendeeType,
} from '@symbiote-native/calendar/legacy';
import { CallConsole } from '../components/CallConsole';
import { Card, Field, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Calendar);
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

type IIds = {
  calendarId: string;
  eventId: string;
  attendeeId: string;
  reminderId: string;
  sourceId: string;
};
type ISetIds = (patch: Partial<IIds>) => void;

function need(text: string, label: string): string {
  if (text.trim() === '') {
    throw new Error(`fill the ${label} field first`);
  }
  return text.trim();
}

function eventData() {
  const start = new Date(Date.now() + HOUR_MS);
  return {
    title: 'Legacy canary event',
    startDate: start,
    endDate: new Date(start.getTime() + HOUR_MS),
    notes: 'Created by the legacy API',
  };
}

function IdsCard({ ids, setIds }: { ids: IIds; setIds: ISetIds }) {
  return (
    <Card testID="calendar-legacy-ids-card" title="Legacy ids">
      <Field
        testID="calendar-legacy-calendar-input"
        label="calendar id"
        value={ids.calendarId}
        onChange={calendarId => setIds({ calendarId })}
      />
      <Field
        testID="calendar-legacy-event-input"
        label="event id"
        value={ids.eventId}
        onChange={eventId => setIds({ eventId })}
      />
      <Field
        testID="calendar-legacy-attendee-input"
        label="attendee id"
        value={ids.attendeeId}
        onChange={attendeeId => setIds({ attendeeId })}
      />
      <Field
        testID="calendar-legacy-reminder-input"
        label="reminder id"
        value={ids.reminderId}
        onChange={reminderId => setIds({ reminderId })}
      />
      <Field
        testID="calendar-legacy-source-input"
        label="source id"
        value={ids.sourceId}
        onChange={sourceId => setIds({ sourceId })}
      />
    </Card>
  );
}

function CalendarCalls({ ids, setIds }: { ids: IIds; setIds: ISetIds }) {
  const calendar = () => need(ids.calendarId, 'calendar id');
  return (
    <CallConsole
      prefix="calendar-legacy-calendars"
      title="Legacy calendars and sources"
      color={color}
      calls={[
        { label: 'isAvailableAsync', run: () => isAvailableAsync() },
        {
          label: 'getCalendarsAsync(event)',
          run: async () => {
            const all = await getCalendarsAsync(EntityTypes.EVENT);
            setIds({ calendarId: all[0]?.id ?? ids.calendarId });
            return all.map(item => ({ id: item.id, title: item.title, type: item.type }));
          },
        },
        {
          label: 'getDefaultCalendarAsync',
          run: async () => {
            const fallback = await getDefaultCalendarAsync();
            setIds({ calendarId: fallback.id, sourceId: fallback.sourceId ?? '' });
            return fallback;
          },
        },
        {
          label: 'createCalendarAsync',
          run: async () => {
            const id = await createCalendarAsync({
              title: 'Legacy Calendar',
              color: '#0891b2',
              entityType: EntityTypes.EVENT,
              sourceId: ids.sourceId.trim() === '' ? undefined : ids.sourceId.trim(),
              name: 'legacy',
            });
            setIds({ calendarId: id });
            return id;
          },
        },
        {
          label: 'updateCalendarAsync',
          run: () => updateCalendarAsync(calendar(), { title: 'Legacy Calendar (updated)' }),
        },
        { label: 'deleteCalendarAsync', run: () => deleteCalendarAsync(calendar()) },
        { label: 'getSourcesAsync', run: () => getSourcesAsync() },
        { label: 'getSourceAsync', run: () => getSourceAsync(need(ids.sourceId, 'source id')) },
      ]}
    />
  );
}

function EventCalls({ ids, setIds }: { ids: IIds; setIds: ISetIds }) {
  const event = () => need(ids.eventId, 'event id');
  return (
    <CallConsole
      prefix="calendar-legacy-events"
      title="Legacy events, attendees and dialogs"
      color={color}
      calls={[
        {
          label: 'getEventsAsync',
          run: async () => {
            const events = await getEventsAsync(
              [need(ids.calendarId, 'calendar id')],
              new Date(Date.now() - 7 * DAY_MS),
              new Date(Date.now() + 30 * DAY_MS),
            );
            setIds({ eventId: events[0]?.id ?? ids.eventId });
            return events.map(item => ({ id: item.id, title: item.title }));
          },
        },
        { label: 'getEventAsync', run: () => getEventAsync(event()) },
        {
          label: 'createEventAsync',
          run: async () => {
            const id = await createEventAsync(need(ids.calendarId, 'calendar id'), eventData());
            setIds({ eventId: id });
            return id;
          },
        },
        {
          label: 'updateEventAsync',
          run: () => updateEventAsync(event(), { title: 'Legacy event (updated)' }),
        },
        { label: 'deleteEventAsync', run: () => deleteEventAsync(event()) },
        { label: 'getAttendeesForEventAsync', run: () => getAttendeesForEventAsync(event()) },
        {
          label: 'createAttendeeAsync',
          run: async () => {
            const id = await createAttendeeAsync(event(), {
              name: 'Legacy Guest',
              email: 'guest@example.com',
              role: AttendeeRole.REQUIRED,
              status: AttendeeStatus.PENDING,
              type: AttendeeType.PERSON,
            });
            setIds({ attendeeId: id });
            return id;
          },
        },
        {
          label: 'updateAttendeeAsync',
          run: () => updateAttendeeAsync(need(ids.attendeeId, 'attendee id'), { name: 'Renamed Guest' }),
        },
        {
          label: 'deleteAttendeeAsync',
          run: () => deleteAttendeeAsync(need(ids.attendeeId, 'attendee id')),
        },
        { label: 'createEventInCalendarAsync', run: () => createEventInCalendarAsync(eventData()) },
        { label: 'openEventInCalendarAsync', run: () => openEventInCalendarAsync({ id: event() }) },
        { label: 'editEventInCalendarAsync', run: () => editEventInCalendarAsync({ id: event() }) },
        { label: 'openEventInCalendar', run: async () => openEventInCalendar(event()) },
      ]}
    />
  );
}

function ReminderCalls({ ids, setIds }: { ids: IIds; setIds: ISetIds }) {
  const reminder = () => need(ids.reminderId, 'reminder id');
  return (
    <CallConsole
      prefix="calendar-legacy-reminders"
      title="Legacy reminders and permissions"
      color={color}
      calls={[
        {
          label: 'getRemindersAsync',
          run: async () => {
            const all = await getRemindersAsync(
              [ids.calendarId.trim() === '' ? null : ids.calendarId.trim()],
              ReminderStatus.INCOMPLETE,
              null,
              null,
            );
            setIds({ reminderId: all[0]?.id ?? ids.reminderId });
            return all.map(item => ({ id: item.id, title: item.title }));
          },
        },
        { label: 'getReminderAsync', run: () => getReminderAsync(reminder()) },
        {
          label: 'createReminderAsync',
          run: async () => {
            const id = await createReminderAsync(ids.calendarId.trim() || null, {
              title: 'Legacy reminder',
              dueDate: new Date(Date.now() + HOUR_MS),
            });
            setIds({ reminderId: id });
            return id;
          },
        },
        {
          label: 'updateReminderAsync',
          run: () => updateReminderAsync(reminder(), { completed: true }),
        },
        { label: 'deleteReminderAsync', run: () => deleteReminderAsync(reminder()) },
        { label: 'getCalendarPermissionsAsync', run: () => getCalendarPermissionsAsync() },
        { label: 'getRemindersPermissionsAsync', run: () => getRemindersPermissionsAsync() },
        { label: 'requestCalendarPermissionsAsync', run: () => requestCalendarPermissionsAsync() },
        { label: 'requestPermissionsAsync', run: () => requestPermissionsAsync() },
        { label: 'requestRemindersPermissionsAsync', run: () => requestRemindersPermissionsAsync() },
      ]}
    />
  );
}

export function LegacyCards() {
  const [ids, setIdsState] = useState<IIds>({
    calendarId: '',
    eventId: '',
    attendeeId: '',
    reminderId: '',
    sourceId: '',
  });
  const setIds: ISetIds = patch =>
    setIdsState(previous => ({ ...previous, ...patch }));
  return (
    <>
      <IdsCard ids={ids} setIds={setIds} />
      <CalendarCalls ids={ids} setIds={setIds} />
      <EventCalls ids={ids} setIds={setIds} />
      <ReminderCalls ids={ids} setIds={setIds} />
    </>
  );
}
