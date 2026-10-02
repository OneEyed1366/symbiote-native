<script lang="ts">
  import {
    getCalendarPermissions,
    getRemindersPermissions,
    requestCalendarPermissions,
    requestRemindersPermissions,
    useCalendarPermissions,
    useRemindersPermissions,
  } from '@symbiote-native/calendar/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.Calendar);

  const calendar = useCalendarPermissions();
  const reminders = useRemindersPermissions();
</script>

<Card testID="calendar-hooks-card" title="Permission hooks">
  <ResultRow testID="calendar-hook-calendar" label="useCalendarPermissions" value={calendar.status?.status ?? 'loading…'} />
  <ResultRow testID="calendar-hook-reminders" label="useRemindersPermissions" value={reminders.status?.status ?? 'loading…'} />
</Card>
<CallConsole
  prefix="calendar-permissions"
  title="Permission calls"
  {color}
  calls={[
    { label: 'getCalendarPermissions', run: () => getCalendarPermissions() },
    { label: 'getCalendarPermissions(writeOnly)', run: () => getCalendarPermissions(true) },
    { label: 'requestCalendarPermissions', run: () => requestCalendarPermissions() },
    {
      label: 'requestCalendarPermissions(writeOnly)',
      run: () => requestCalendarPermissions(true),
    },
    { label: 'getRemindersPermissions', run: () => getRemindersPermissions() },
    { label: 'requestRemindersPermissions', run: () => requestRemindersPermissions() },
    { label: 'hook request (calendar)', run: () => calendar.requestPermission() },
    { label: 'hook request (reminders)', run: () => reminders.requestPermission() },
  ]}
/>
