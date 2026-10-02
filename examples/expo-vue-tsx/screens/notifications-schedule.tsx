import { defineComponent, ref } from 'vue';
import {
  SchedulableTriggerInputTypes,
  cancelAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync,
  dismissAllNotificationsAsync,
  dismissNotificationAsync,
  getAllScheduledNotificationsAsync,
  getNextTriggerDateAsync,
  getPresentedNotificationsAsync,
  scheduleNotificationAsync,
} from '@symbiote-native/notifications/vue';
import type {
  IInterruptionLevel,
  INotificationContentInput,
  ISchedulableNotificationTriggerInput,
} from '@symbiote-native/notifications/vue';
import { CallConsole } from '../components/CallConsole';
import { Card, ChoiceRow, Field, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Notifications);
const KINDS: readonly { label: string; value: SchedulableTriggerInputTypes }[] = [
  { label: 'TIME_INTERVAL', value: SchedulableTriggerInputTypes.TIME_INTERVAL },
  { label: 'DATE', value: SchedulableTriggerInputTypes.DATE },
  { label: 'DAILY', value: SchedulableTriggerInputTypes.DAILY },
  { label: 'WEEKLY', value: SchedulableTriggerInputTypes.WEEKLY },
  { label: 'MONTHLY', value: SchedulableTriggerInputTypes.MONTHLY },
  { label: 'YEARLY', value: SchedulableTriggerInputTypes.YEARLY },
  { label: 'CALENDAR', value: SchedulableTriggerInputTypes.CALENDAR },
];
const LEVELS: readonly { label: string; value: IInterruptionLevel }[] = [
  { label: 'passive', value: 'passive' },
  { label: 'active', value: 'active' },
  { label: 'timeSensitive', value: 'timeSensitive' },
  { label: 'critical', value: 'critical' },
];
const MS_PER_SECOND = 1_000;

type IForm = {
  title: string;
  subtitle: string;
  body: string;
  data: string;
  badge: string;
  vibrate: string;
  categoryIdentifier: string;
  level: IInterruptionLevel;
  isSound: boolean;
  isSticky: boolean;
  isAutoDismiss: boolean;
  kind: SchedulableTriggerInputTypes;
  channelId: string;
  seconds: string;
  isRepeats: boolean;
  hour: string;
  minute: string;
  weekday: string;
  day: string;
  month: string;
  identifier: string;
};
type ISetForm = (patch: Partial<IForm>) => void;

function optional(text: string): string | undefined {
  return text === '' ? undefined : text;
}

function contentOf(form: IForm): INotificationContentInput {
  return {
    title: form.title,
    subtitle: optional(form.subtitle),
    body: form.body,
    data: JSON.parse(form.data || '{}'),
    badge: form.badge === '' ? undefined : Number(form.badge),
    sound: form.isSound,
    vibrate: form.vibrate === '' ? undefined : form.vibrate.split(',').map(Number),
    categoryIdentifier: optional(form.categoryIdentifier),
    interruptionLevel: form.level,
    sticky: form.isSticky,
    autoDismiss: form.isAutoDismiss,
  };
}

function triggerOf(form: IForm): ISchedulableNotificationTriggerInput {
  const channelId = optional(form.channelId);
  const at = { hour: Number(form.hour), minute: Number(form.minute) };
  switch (form.kind) {
    case SchedulableTriggerInputTypes.DATE:
      return { type: form.kind, date: Date.now() + Number(form.seconds) * MS_PER_SECOND, channelId };
    case SchedulableTriggerInputTypes.DAILY:
      return { type: form.kind, channelId, ...at };
    case SchedulableTriggerInputTypes.WEEKLY:
      return { type: form.kind, channelId, weekday: Number(form.weekday), ...at };
    case SchedulableTriggerInputTypes.MONTHLY:
      return { type: form.kind, channelId, day: Number(form.day), ...at };
    case SchedulableTriggerInputTypes.YEARLY:
      return { type: form.kind, channelId, day: Number(form.day), month: Number(form.month), ...at };
    case SchedulableTriggerInputTypes.CALENDAR:
      return { type: form.kind, channelId, repeats: form.isRepeats, weekday: Number(form.weekday), ...at };
    default:
      return { type: SchedulableTriggerInputTypes.TIME_INTERVAL, channelId, repeats: form.isRepeats, seconds: Number(form.seconds) };
  }
}

function ContentCard(props: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="notifications-content-card" title="Notification content">
      <Field testID="notifications-title-input" label="title" value={props.form.title} onChange={title => props.setForm({ title })} />
      <Field testID="notifications-subtitle-input" label="subtitle (iOS)" value={props.form.subtitle} onChange={subtitle => props.setForm({ subtitle })} />
      <Field testID="notifications-body-input" label="body" value={props.form.body} onChange={body => props.setForm({ body })} />
      <Field testID="notifications-data-input" label="data (JSON)" value={props.form.data} onChange={data => props.setForm({ data })} />
      <Field testID="notifications-content-badge-input" label="badge" value={props.form.badge} onChange={badge => props.setForm({ badge })} />
      <Field testID="notifications-vibrate-input" label="vibrate (Android, comma separated ms)" value={props.form.vibrate} onChange={vibrate => props.setForm({ vibrate })} />
      <Field testID="notifications-category-input" label="categoryIdentifier" value={props.form.categoryIdentifier} onChange={categoryIdentifier => props.setForm({ categoryIdentifier })} />
      <ChoiceRow testID="notifications-level" label="interruptionLevel (iOS)" options={LEVELS} value={props.form.level} onChange={level => props.setForm({ level })} color={color} />
      <ToggleRow testID="notifications-content-sound-switch" label="sound" value={props.form.isSound} onChange={isSound => props.setForm({ isSound })} color={color} />
      <ToggleRow testID="notifications-sticky-switch" label="sticky (Android)" value={props.form.isSticky} onChange={isSticky => props.setForm({ isSticky })} color={color} />
      <ToggleRow testID="notifications-autodismiss-switch" label="autoDismiss (Android)" value={props.form.isAutoDismiss} onChange={isAutoDismiss => props.setForm({ isAutoDismiss })} color={color} />
    </Card>
  );
}

function TriggerCard(props: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="notifications-trigger-card" title="Trigger">
      <ChoiceRow testID="notifications-kind" label="SchedulableTriggerInputTypes" options={KINDS} value={props.form.kind} onChange={kind => props.setForm({ kind })} color={color} />
      <Field testID="notifications-channel-input" label="channelId (Android)" value={props.form.channelId} onChange={channelId => props.setForm({ channelId })} />
      <Field testID="notifications-seconds-input" label="seconds (TIME_INTERVAL, DATE offset)" value={props.form.seconds} onChange={seconds => props.setForm({ seconds })} />
      <ToggleRow testID="notifications-repeats-switch" label="repeats (TIME_INTERVAL, CALENDAR)" value={props.form.isRepeats} onChange={isRepeats => props.setForm({ isRepeats })} color={color} />
      <Field testID="notifications-hour-input" label="hour" value={props.form.hour} onChange={hour => props.setForm({ hour })} />
      <Field testID="notifications-minute-input" label="minute" value={props.form.minute} onChange={minute => props.setForm({ minute })} />
      <Field testID="notifications-weekday-input" label="weekday (1 is Sunday)" value={props.form.weekday} onChange={weekday => props.setForm({ weekday })} />
      <Field testID="notifications-day-input" label="day" value={props.form.day} onChange={day => props.setForm({ day })} />
      <Field testID="notifications-month-input" label="month" value={props.form.month} onChange={month => props.setForm({ month })} />
      <Field testID="notifications-identifier-input" label="identifier (cancel and dismiss)" value={props.form.identifier} onChange={identifier => props.setForm({ identifier })} />
    </Card>
  );
}

function SchedulerCalls(props: { form: IForm }) {
  return (
    <CallConsole
      prefix="notifications-schedule"
      title="Scheduler"
      color={color}
      hint="Background the app after scheduling to see the notification banner."
      calls={[
        { label: 'scheduleNotificationAsync', run: () => scheduleNotificationAsync({ content: contentOf(props.form), trigger: triggerOf(props.form) }) },
        { label: 'scheduleNotificationAsync (null trigger, now)', run: () => scheduleNotificationAsync({ content: contentOf(props.form), trigger: null }) },
        { label: 'scheduleNotificationAsync (identifier)', run: () => scheduleNotificationAsync({ identifier: props.form.identifier, content: contentOf(props.form), trigger: triggerOf(props.form) }) },
        { label: 'getNextTriggerDateAsync', run: async () => { const next = await getNextTriggerDateAsync(triggerOf(props.form)); return next === null ? null : new Date(next).toISOString(); } },
        { label: 'getAllScheduledNotificationsAsync', run: () => getAllScheduledNotificationsAsync() },
        { label: 'cancelScheduledNotificationAsync', run: () => cancelScheduledNotificationAsync(props.form.identifier) },
        { label: 'cancelAllScheduledNotificationsAsync', run: () => cancelAllScheduledNotificationsAsync() },
      ]}
    />
  );
}

export const ScheduleCards = defineComponent(
  () => {
    const form = ref<IForm>({
      title: 'Canary',
      subtitle: '',
      body: 'Scheduled from the example app',
      data: '{"screen":"Notifications"}',
      badge: '',
      vibrate: '',
      categoryIdentifier: '',
      level: 'active',
      isSound: true,
      isSticky: false,
      isAutoDismiss: true,
      kind: SchedulableTriggerInputTypes.TIME_INTERVAL,
      channelId: '',
      seconds: '5',
      isRepeats: false,
      hour: '9',
      minute: '30',
      weekday: '2',
      day: '1',
      month: '1',
      identifier: '',
    });
    const setForm: ISetForm = patch => {
      form.value = { ...form.value, ...patch };
    };
    return () => (
      <>
        <ContentCard form={form.value} setForm={setForm} />
        <TriggerCard form={form.value} setForm={setForm} />
        <SchedulerCalls form={form.value} />
        <CallConsole
          prefix="notifications-presented"
          title="Presented notifications"
          color={color}
          calls={[
            { label: 'getPresentedNotificationsAsync', run: () => getPresentedNotificationsAsync() },
            { label: 'dismissNotificationAsync', run: () => dismissNotificationAsync(form.value.identifier) },
            { label: 'dismissAllNotificationsAsync', run: () => dismissAllNotificationsAsync() },
          ]}
        />
      </>
    );
  },
  { name: 'ScheduleCards' },
);
