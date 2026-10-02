import { useState } from 'react';
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
} from '@symbiote-native/notifications/react';
import type {
  IInterruptionLevel,
  INotificationContentInput,
  ISchedulableNotificationTriggerInput,
} from '@symbiote-native/notifications/react';
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

function ContentCard({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="notifications-content-card" title="Notification content">
      <Field testID="notifications-title-input" label="title" value={form.title} onChange={title => setForm({ title })} />
      <Field testID="notifications-subtitle-input" label="subtitle (iOS)" value={form.subtitle} onChange={subtitle => setForm({ subtitle })} />
      <Field testID="notifications-body-input" label="body" value={form.body} onChange={body => setForm({ body })} />
      <Field testID="notifications-data-input" label="data (JSON)" value={form.data} onChange={data => setForm({ data })} />
      <Field testID="notifications-content-badge-input" label="badge" value={form.badge} onChange={badge => setForm({ badge })} />
      <Field testID="notifications-vibrate-input" label="vibrate (Android, comma separated ms)" value={form.vibrate} onChange={vibrate => setForm({ vibrate })} />
      <Field testID="notifications-category-input" label="categoryIdentifier" value={form.categoryIdentifier} onChange={categoryIdentifier => setForm({ categoryIdentifier })} />
      <ChoiceRow testID="notifications-level" label="interruptionLevel (iOS)" options={LEVELS} value={form.level} onChange={level => setForm({ level })} color={color} />
      <ToggleRow testID="notifications-content-sound-switch" label="sound" value={form.isSound} onChange={isSound => setForm({ isSound })} color={color} />
      <ToggleRow testID="notifications-sticky-switch" label="sticky (Android)" value={form.isSticky} onChange={isSticky => setForm({ isSticky })} color={color} />
      <ToggleRow testID="notifications-autodismiss-switch" label="autoDismiss (Android)" value={form.isAutoDismiss} onChange={isAutoDismiss => setForm({ isAutoDismiss })} color={color} />
    </Card>
  );
}

function TriggerCard({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="notifications-trigger-card" title="Trigger">
      <ChoiceRow testID="notifications-kind" label="SchedulableTriggerInputTypes" options={KINDS} value={form.kind} onChange={kind => setForm({ kind })} color={color} />
      <Field testID="notifications-channel-input" label="channelId (Android)" value={form.channelId} onChange={channelId => setForm({ channelId })} />
      <Field testID="notifications-seconds-input" label="seconds (TIME_INTERVAL, DATE offset)" value={form.seconds} onChange={seconds => setForm({ seconds })} />
      <ToggleRow testID="notifications-repeats-switch" label="repeats (TIME_INTERVAL, CALENDAR)" value={form.isRepeats} onChange={isRepeats => setForm({ isRepeats })} color={color} />
      <Field testID="notifications-hour-input" label="hour" value={form.hour} onChange={hour => setForm({ hour })} />
      <Field testID="notifications-minute-input" label="minute" value={form.minute} onChange={minute => setForm({ minute })} />
      <Field testID="notifications-weekday-input" label="weekday (1 is Sunday)" value={form.weekday} onChange={weekday => setForm({ weekday })} />
      <Field testID="notifications-day-input" label="day" value={form.day} onChange={day => setForm({ day })} />
      <Field testID="notifications-month-input" label="month" value={form.month} onChange={month => setForm({ month })} />
      <Field testID="notifications-identifier-input" label="identifier (cancel and dismiss)" value={form.identifier} onChange={identifier => setForm({ identifier })} />
    </Card>
  );
}

export function ScheduleCards() {
  const [form, setFormState] = useState<IForm>({
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
  const setForm: ISetForm = patch => setFormState(previous => ({ ...previous, ...patch }));
  return (
    <>
      <ContentCard form={form} setForm={setForm} />
      <TriggerCard form={form} setForm={setForm} />
      <CallConsole
        prefix="notifications-schedule"
        title="Scheduler"
        color={color}
        hint="Background the app after scheduling to see the notification banner."
        calls={[
          { label: 'scheduleNotificationAsync', run: () => scheduleNotificationAsync({ content: contentOf(form), trigger: triggerOf(form) }) },
          { label: 'scheduleNotificationAsync (null trigger, now)', run: () => scheduleNotificationAsync({ content: contentOf(form), trigger: null }) },
          { label: 'scheduleNotificationAsync (identifier)', run: () => scheduleNotificationAsync({ identifier: form.identifier, content: contentOf(form), trigger: triggerOf(form) }) },
          { label: 'getNextTriggerDateAsync', run: async () => { const next = await getNextTriggerDateAsync(triggerOf(form)); return next === null ? null : new Date(next).toISOString(); } },
          { label: 'getAllScheduledNotificationsAsync', run: () => getAllScheduledNotificationsAsync() },
          { label: 'cancelScheduledNotificationAsync', run: () => cancelScheduledNotificationAsync(form.identifier) },
          { label: 'cancelAllScheduledNotificationsAsync', run: () => cancelAllScheduledNotificationsAsync() },
        ]}
      />
      <CallConsole
        prefix="notifications-presented"
        title="Presented notifications"
        color={color}
        calls={[
          { label: 'getPresentedNotificationsAsync', run: () => getPresentedNotificationsAsync() },
          { label: 'dismissNotificationAsync', run: () => dismissNotificationAsync(form.identifier) },
          { label: 'dismissAllNotificationsAsync', run: () => dismissAllNotificationsAsync() },
        ]}
      />
    </>
  );
}
