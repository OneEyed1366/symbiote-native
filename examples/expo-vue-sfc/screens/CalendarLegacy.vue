<script setup lang="ts">
import { reactive } from 'vue';
import {
  AttendeeRole,
  AttendeeStatus,
  AttendeeType,
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
} from '@symbiote-native/calendar/legacy';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { DAY_MS, need } from './calendar-summaries';

const color = lineColorOf(ROUTE_NAME.Calendar);
const HOUR_MS = 3_600_000;

type ILegacyIds = {
  calendarId: string;
  eventId: string;
  attendeeId: string;
  reminderId: string;
  sourceId: string;
};

const ids = reactive<ILegacyIds>({
  calendarId: '',
  eventId: '',
  attendeeId: '',
  reminderId: '',
  sourceId: '',
});

const calendar = (): string => need(ids.calendarId, 'calendar id');
const event = (): string => need(ids.eventId, 'event id');
const attendee = (): string => need(ids.attendeeId, 'attendee id');
const reminder = (): string => need(ids.reminderId, 'reminder id');

function eventData() {
  const start = new Date(Date.now() + HOUR_MS);
  return {
    title: 'Legacy canary event',
    startDate: start,
    endDate: new Date(start.getTime() + HOUR_MS),
    notes: 'Created by the legacy API',
  };
}

const calendarCalls = [
  { label: 'isAvailableAsync', run: () => isAvailableAsync() },
  {
    label: 'getCalendarsAsync(event)',
    run: async () => {
      const all = await getCalendarsAsync(EntityTypes.EVENT);
      ids.calendarId = all[0]?.id ?? ids.calendarId;
      return all.map(item => ({ id: item.id, title: item.title, type: item.type }));
    },
  },
  {
    label: 'getDefaultCalendarAsync',
    run: async () => {
      const fallback = await getDefaultCalendarAsync();
      ids.calendarId = fallback.id;
      ids.sourceId = fallback.sourceId ?? '';
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
      ids.calendarId = id;
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
];

const eventCalls = [
  {
    label: 'getEventsAsync',
    run: async () => {
      const events = await getEventsAsync(
        [calendar()],
        new Date(Date.now() - 7 * DAY_MS),
        new Date(Date.now() + 30 * DAY_MS),
      );
      ids.eventId = events[0]?.id ?? ids.eventId;
      return events.map(item => ({ id: item.id, title: item.title }));
    },
  },
  { label: 'getEventAsync', run: () => getEventAsync(event()) },
  {
    label: 'createEventAsync',
    run: async () => {
      const id = await createEventAsync(calendar(), eventData());
      ids.eventId = id;
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
      ids.attendeeId = id;
      return id;
    },
  },
  {
    label: 'updateAttendeeAsync',
    run: () => updateAttendeeAsync(attendee(), { name: 'Renamed Guest' }),
  },
  { label: 'deleteAttendeeAsync', run: () => deleteAttendeeAsync(attendee()) },
  { label: 'createEventInCalendarAsync', run: () => createEventInCalendarAsync(eventData()) },
  { label: 'openEventInCalendarAsync', run: () => openEventInCalendarAsync({ id: event() }) },
  { label: 'editEventInCalendarAsync', run: () => editEventInCalendarAsync({ id: event() }) },
  { label: 'openEventInCalendar', run: async () => openEventInCalendar(event()) },
];

const reminderCalls = [
  {
    label: 'getRemindersAsync',
    run: async () => {
      const all = await getRemindersAsync(
        [ids.calendarId.trim() === '' ? null : ids.calendarId.trim()],
        ReminderStatus.INCOMPLETE,
        null,
        null,
      );
      ids.reminderId = all[0]?.id ?? ids.reminderId;
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
      ids.reminderId = id;
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
  {
    label: 'requestRemindersPermissionsAsync',
    run: () => requestRemindersPermissionsAsync(),
  },
];
</script>

<template>
  <Card testID="calendar-legacy-ids-card" title="Legacy ids">
    <Field
      testID="calendar-legacy-calendar-input"
      label="calendar id"
      :value="ids.calendarId"
      :onChange="calendarId => (ids.calendarId = calendarId)"
    />
    <Field
      testID="calendar-legacy-event-input"
      label="event id"
      :value="ids.eventId"
      :onChange="eventId => (ids.eventId = eventId)"
    />
    <Field
      testID="calendar-legacy-attendee-input"
      label="attendee id"
      :value="ids.attendeeId"
      :onChange="attendeeId => (ids.attendeeId = attendeeId)"
    />
    <Field
      testID="calendar-legacy-reminder-input"
      label="reminder id"
      :value="ids.reminderId"
      :onChange="reminderId => (ids.reminderId = reminderId)"
    />
    <Field
      testID="calendar-legacy-source-input"
      label="source id"
      :value="ids.sourceId"
      :onChange="sourceId => (ids.sourceId = sourceId)"
    />
  </Card>
  <CallConsole
    prefix="calendar-legacy-calendars"
    title="Legacy calendars and sources"
    :color="color"
    :calls="calendarCalls"
  />
  <CallConsole
    prefix="calendar-legacy-events"
    title="Legacy events, attendees and dialogs"
    :color="color"
    :calls="eventCalls"
  />
  <CallConsole
    prefix="calendar-legacy-reminders"
    title="Legacy reminders and permissions"
    :color="color"
    :calls="reminderCalls"
  />
</template>
