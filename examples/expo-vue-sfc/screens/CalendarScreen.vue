<script setup lang="ts">
import { ref } from 'vue';
import {
  getDefaultCalendarSync,
  listEvents,
  requestCalendarPermissions,
} from '@symbiote-native/calendar/vue';
import CallConsole from '../components/CallConsole.vue';
import Explorer from '../components/Explorer.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import CalendarFormCards from './CalendarFormCards.vue';
import CalendarLegacy from './CalendarLegacy.vue';
import CalendarModern from './CalendarModern.vue';
import CalendarPermissions from './CalendarPermissions.vue';
import { INITIAL_FORM } from './calendar-form';
import type { IForm } from './calendar-form';
import { DAY_MS } from './calendar-summaries';
import type { IIds } from './calendar-summaries';

const color = lineColorOf(ROUTE_NAME.Calendar);
const WEEK_DAYS = 7;

const form = ref<IForm>({ ...INITIAL_FORM });
const ids = ref<IIds>({ calendarId: '', eventId: '', reminderId: '' });

function setForm(patch: Partial<IForm>): void {
  form.value = { ...form.value, ...patch };
}

function setIds(patch: Partial<IIds>): void {
  ids.value = { ...ids.value, ...patch };
}

const bookingCalls = [
  { label: 'Allow calendar access', run: () => requestCalendarPermissions() },
  {
    label: 'Add event with system form',
    run: () =>
      getDefaultCalendarSync().addEventWithForm({ title: form.value.title, notes: form.value.notes }),
  },
];

const agendaCalls = [
  {
    label: 'List this week',
    run: async () =>
      (
        await listEvents(
          [getDefaultCalendarSync().id],
          new Date(),
          new Date(Date.now() + WEEK_DAYS * DAY_MS),
        )
      ).map(event => ({ id: event.id, title: event.title, start: event.startDate })),
  },
];
</script>

<template>
  <ScreenShell
    :route="ROUTE_NAME.Calendar"
    testID="calendar-scroll"
    title="Calendar"
    body="Put events and reminders into the user's calendar and read what is scheduled: add a booking, show an agenda, manage attendees and recurrence. Always behind a permission prompt."
  >
    <Scenario
      testID="calendar-booking-scenario"
      title="Add a booking or a flight to the user's calendar"
      why="After a purchase or a booking, offer one tap to put it in the calendar. The system form lets the user review and save, and the app never reads their other events."
      :steps="[
        'Press Allow calendar access and accept',
        'Press Add event with system form',
        'Save or cancel in the form',
      ]"
      expect="The form opens with the title and notes from the explorer fields. After Save the event shows up in the system Calendar app."
    >
      <CallConsole isBare prefix="calendar-booking" title="Add event" :color="color" :calls="bookingCalls" />
    </Scenario>
    <Scenario
      testID="calendar-agenda-scenario"
      title="Show what is coming up this week"
      why="Build an agenda, find a free slot or warn about a clash with an existing event, using the user's default calendar."
      :steps="['Allow calendar access in the previous card', 'Press List this week']"
      expect="The output lists event ids, titles and start times for the next 7 days. An empty list means a free week."
    >
      <CallConsole isBare prefix="calendar-agenda" title="This week" :color="color" :calls="agendaCalls" />
    </Scenario>
    <Explorer testID="calendar-explorer" :color="color">
      <CalendarFormCards :form="form" :setForm="setForm" :color="color" />
      <CalendarPermissions />
      <CalendarModern :ids="ids" :setIds="setIds" :form="form" />
      <CalendarLegacy />
    </Explorer>
  </ScreenShell>
</template>
