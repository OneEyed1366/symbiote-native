<script lang="ts">
  import {
    cancelAllScheduledNotificationsAsync,
    cancelScheduledNotificationAsync,
    dismissAllNotificationsAsync,
    dismissNotificationAsync,
    getAllScheduledNotificationsAsync,
    getNextTriggerDateAsync,
    getPresentedNotificationsAsync,
    scheduleNotificationAsync,
  } from '@symbiote-native/notifications/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import {
    INITIAL_SCHEDULE_FORM,
    KINDS,
    LEVELS,
    contentOf,
    triggerOf,
  } from './notification-schedule-form';
  import type { IScheduleForm } from './notification-schedule-form';

  const color = lineColorOf(ROUTE_NAME.Notifications);

  let form = $state<IScheduleForm>({ ...INITIAL_SCHEDULE_FORM });
</script>

<Card testID="notifications-content-card" title="Notification content">
  <Field testID="notifications-title-input" label="title" value={form.title} onChange={title => (form.title = title)} />
  <Field testID="notifications-subtitle-input" label="subtitle (iOS)" value={form.subtitle} onChange={subtitle => (form.subtitle = subtitle)} />
  <Field testID="notifications-body-input" label="body" value={form.body} onChange={body => (form.body = body)} />
  <Field testID="notifications-data-input" label="data (JSON)" value={form.data} onChange={data => (form.data = data)} />
  <Field testID="notifications-content-badge-input" label="badge" value={form.badge} onChange={badge => (form.badge = badge)} />
  <Field testID="notifications-vibrate-input" label="vibrate (Android, comma separated ms)" value={form.vibrate} onChange={vibrate => (form.vibrate = vibrate)} />
  <Field testID="notifications-category-input" label="categoryIdentifier" value={form.categoryIdentifier} onChange={categoryIdentifier => (form.categoryIdentifier = categoryIdentifier)} />
  <ChoiceRow testID="notifications-level" label="interruptionLevel (iOS)" options={LEVELS} value={form.level} onChange={level => (form.level = level)} {color} />
  <ToggleRow testID="notifications-content-sound-switch" label="sound" value={form.isSound} onChange={isSound => (form.isSound = isSound)} {color} />
  <ToggleRow testID="notifications-sticky-switch" label="sticky (Android)" value={form.isSticky} onChange={isSticky => (form.isSticky = isSticky)} {color} />
  <ToggleRow testID="notifications-autodismiss-switch" label="autoDismiss (Android)" value={form.isAutoDismiss} onChange={isAutoDismiss => (form.isAutoDismiss = isAutoDismiss)} {color} />
</Card>
<Card testID="notifications-trigger-card" title="Trigger">
  <ChoiceRow testID="notifications-kind" label="SchedulableTriggerInputTypes" options={KINDS} value={form.kind} onChange={kind => (form.kind = kind)} {color} />
  <Field testID="notifications-channel-input" label="channelId (Android)" value={form.channelId} onChange={channelId => (form.channelId = channelId)} />
  <Field testID="notifications-seconds-input" label="seconds (TIME_INTERVAL, DATE offset)" value={form.seconds} onChange={seconds => (form.seconds = seconds)} />
  <ToggleRow testID="notifications-repeats-switch" label="repeats (TIME_INTERVAL, CALENDAR)" value={form.isRepeats} onChange={isRepeats => (form.isRepeats = isRepeats)} {color} />
  <Field testID="notifications-hour-input" label="hour" value={form.hour} onChange={hour => (form.hour = hour)} />
  <Field testID="notifications-minute-input" label="minute" value={form.minute} onChange={minute => (form.minute = minute)} />
  <Field testID="notifications-weekday-input" label="weekday (1 is Sunday)" value={form.weekday} onChange={weekday => (form.weekday = weekday)} />
  <Field testID="notifications-day-input" label="day" value={form.day} onChange={day => (form.day = day)} />
  <Field testID="notifications-month-input" label="month" value={form.month} onChange={month => (form.month = month)} />
  <Field testID="notifications-identifier-input" label="identifier (cancel and dismiss)" value={form.identifier} onChange={identifier => (form.identifier = identifier)} />
</Card>
<CallConsole
  prefix="notifications-schedule"
  title="Scheduler"
  {color}
  hint="Background the app after scheduling to see the notification banner."
  calls={[
    {
      label: 'scheduleNotificationAsync',
      run: () => scheduleNotificationAsync({ content: contentOf(form), trigger: triggerOf(form) }),
    },
    {
      label: 'scheduleNotificationAsync (null trigger, now)',
      run: () => scheduleNotificationAsync({ content: contentOf(form), trigger: null }),
    },
    {
      label: 'scheduleNotificationAsync (identifier)',
      run: () =>
        scheduleNotificationAsync({
          identifier: form.identifier,
          content: contentOf(form),
          trigger: triggerOf(form),
        }),
    },
    {
      label: 'getNextTriggerDateAsync',
      run: async () => {
        const next = await getNextTriggerDateAsync(triggerOf(form));
        return next === null ? null : new Date(next).toISOString();
      },
    },
    { label: 'getAllScheduledNotificationsAsync', run: () => getAllScheduledNotificationsAsync() },
    {
      label: 'cancelScheduledNotificationAsync',
      run: () => cancelScheduledNotificationAsync(form.identifier),
    },
    {
      label: 'cancelAllScheduledNotificationsAsync',
      run: () => cancelAllScheduledNotificationsAsync(),
    },
  ]}
/>
<CallConsole
  prefix="notifications-presented"
  title="Presented notifications"
  {color}
  calls={[
    { label: 'getPresentedNotificationsAsync', run: () => getPresentedNotificationsAsync() },
    { label: 'dismissNotificationAsync', run: () => dismissNotificationAsync(form.identifier) },
    { label: 'dismissAllNotificationsAsync', run: () => dismissAllNotificationsAsync() },
  ]}
/>
