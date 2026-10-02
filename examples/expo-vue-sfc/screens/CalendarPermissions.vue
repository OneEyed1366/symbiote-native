<script setup lang="ts">
import { computed } from 'vue';
import {
  getCalendarPermissions,
  getRemindersPermissions,
  requestCalendarPermissions,
  requestRemindersPermissions,
  useCalendarPermissions,
  useRemindersPermissions,
} from '@symbiote-native/calendar/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ResultRow from '../components/ResultRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Calendar);

const [calendarState, requestCalendar] = useCalendarPermissions();
const [remindersState, requestReminders] = useRemindersPermissions();

const calendarStatus = computed(() => calendarState.value?.status ?? 'loading…');
const remindersStatus = computed(() => remindersState.value?.status ?? 'loading…');

const calls = [
  { label: 'getCalendarPermissions', run: () => getCalendarPermissions() },
  { label: 'getCalendarPermissions(writeOnly)', run: () => getCalendarPermissions(true) },
  { label: 'requestCalendarPermissions', run: () => requestCalendarPermissions() },
  {
    label: 'requestCalendarPermissions(writeOnly)',
    run: () => requestCalendarPermissions(true),
  },
  { label: 'getRemindersPermissions', run: () => getRemindersPermissions() },
  { label: 'requestRemindersPermissions', run: () => requestRemindersPermissions() },
  { label: 'hook request (calendar)', run: () => requestCalendar() },
  { label: 'hook request (reminders)', run: () => requestReminders() },
];
</script>

<template>
  <Card testID="calendar-hooks-card" title="Permission hooks">
    <ResultRow
      testID="calendar-hook-calendar"
      label="useCalendarPermissions"
      :value="calendarStatus"
    />
    <ResultRow
      testID="calendar-hook-reminders"
      label="useRemindersPermissions"
      :value="remindersStatus"
    />
  </Card>
  <CallConsole prefix="calendar-permissions" title="Permission calls" :color="color" :calls="calls" />
</template>
