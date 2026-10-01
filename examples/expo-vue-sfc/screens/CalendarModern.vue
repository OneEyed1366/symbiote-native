<script setup lang="ts">
import {
  AttendeeRole,
  AttendeeStatus,
  AttendeeType,
  CalendarAccessLevel,
  EntityTypes,
  ExpoCalendar,
  ExpoCalendarAttendee,
  ExpoCalendarEvent,
  ExpoCalendarReminder,
  ReminderStatus,
  createCalendar,
  getCalendars,
  getDefaultCalendarSync,
  getSourcesSync,
  listEvents,
  presentPicker,
} from '@symbiote-native/calendar/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { toEventInput, toReminderInput } from './calendar-form';
import type { IForm } from './calendar-form';
import {
  DAY_MS,
  calendarSummary,
  eventSummary,
  need,
  reminderSummary,
} from './calendar-summaries';
import type { IIds, ISetIds } from './calendar-summaries';

const props = defineProps<{ ids: IIds; setIds: ISetIds; form: IForm }>();

const color = lineColorOf(ROUTE_NAME.Calendar);
const WEEK_BACK = new Date(Date.now() - 7 * DAY_MS);

const calendar = () => ExpoCalendar.get(need(props.ids.calendarId, 'calendar id'));
const event = () => ExpoCalendarEvent.get(need(props.ids.eventId, 'event id'));
const reminder = () => ExpoCalendarReminder.get(need(props.ids.reminderId, 'reminder id'));

async function firstAttendee(): Promise<ExpoCalendarAttendee> {
  const [attendee] = await (await event()).getAttendees();
  if (attendee === undefined) {
    throw new Error('the event has no attendees, use createAttendee (Android) first');
  }
  return attendee;
}

const topCalls = [
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
  {
    label: 'getDefaultCalendarSync',
    run: async () => calendarSummary(getDefaultCalendarSync()),
  },
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
          WEEK_BACK,
          new Date(Date.now() + 30 * DAY_MS),
        )
      ).map(eventSummary),
  },
];

const instanceCalls = [
  { label: 'ExpoCalendar.get', run: async () => calendarSummary(await calendar()) },
  {
    label: 'listEvents (this calendar)',
    run: async () =>
      (await (await calendar()).listEvents(WEEK_BACK, new Date(Date.now() + 30 * DAY_MS))).map(
        eventSummary,
      ),
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
      const created = await (await calendar()).createEvent(toEventInput(props.form));
      props.setIds({ eventId: created.id });
      return eventSummary(created);
    },
  },
  {
    label: 'createReminder',
    run: async () => {
      const created = await (await calendar()).createReminder(toReminderInput(props.form));
      props.setIds({ reminderId: created.id ?? '' });
      return reminderSummary(created);
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
];

const eventCalls = [
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
  {
    label: 'openInCalendar',
    run: async () => (await event()).openInCalendar({ allowsEditing: true }),
  },
  { label: 'editInCalendar', run: async () => (await event()).editInCalendar() },
  {
    label: 'update (event)',
    run: async () =>
      (await event()).update({ title: `${props.form.title} (updated)`, location: null }),
  },
  { label: 'delete (event)', run: async () => (await event()).delete() },
];

const attendeeReminderCalls = [
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
];
</script>

<template>
  <Card testID="calendar-ids-card" title="Selected ids">
    <Field
      testID="calendar-id-input"
      label="calendar id"
      :value="ids.calendarId"
      :onChange="calendarId => setIds({ calendarId })"
    />
    <Field
      testID="calendar-event-id-input"
      label="event id"
      :value="ids.eventId"
      :onChange="eventId => setIds({ eventId })"
    />
    <Field
      testID="calendar-reminder-id-input"
      label="reminder id"
      :value="ids.reminderId"
      :onChange="reminderId => setIds({ reminderId })"
    />
  </Card>
  <CallConsole prefix="calendar-top" title="Module functions" :color="color" :calls="topCalls" />
  <CallConsole
    prefix="calendar-instance"
    title="ExpoCalendar"
    :color="color"
    :calls="instanceCalls"
  />
  <CallConsole
    prefix="calendar-event"
    title="ExpoCalendarEvent"
    :color="color"
    :calls="eventCalls"
  />
  <CallConsole
    prefix="calendar-attendee-reminder"
    title="ExpoCalendarAttendee and ExpoCalendarReminder"
    :color="color"
    :calls="attendeeReminderCalls"
  />
</template>
