import { SchedulableTriggerInputTypes } from '@symbiote-native/notifications/angular';
import type {
  IInterruptionLevel,
  INotificationContentInput,
  ISchedulableNotificationTriggerInput,
} from '@symbiote-native/notifications/angular';

export const KINDS: readonly {
  label: string;
  value: SchedulableTriggerInputTypes;
}[] = [
  { label: 'TIME_INTERVAL', value: SchedulableTriggerInputTypes.TIME_INTERVAL },
  { label: 'DATE', value: SchedulableTriggerInputTypes.DATE },
  { label: 'DAILY', value: SchedulableTriggerInputTypes.DAILY },
  { label: 'WEEKLY', value: SchedulableTriggerInputTypes.WEEKLY },
  { label: 'MONTHLY', value: SchedulableTriggerInputTypes.MONTHLY },
  { label: 'YEARLY', value: SchedulableTriggerInputTypes.YEARLY },
  { label: 'CALENDAR', value: SchedulableTriggerInputTypes.CALENDAR },
];
export const LEVELS: readonly { label: string; value: IInterruptionLevel }[] = [
  { label: 'passive', value: 'passive' },
  { label: 'active', value: 'active' },
  { label: 'timeSensitive', value: 'timeSensitive' },
  { label: 'critical', value: 'critical' },
];
const MS_PER_SECOND = 1_000;

export type IScheduleForm = {
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

export const INITIAL_SCHEDULE_FORM: IScheduleForm = {
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
};

function optional(text: string): string | undefined {
  return text === '' ? undefined : text;
}

export function contentOf(form: IScheduleForm): INotificationContentInput {
  return {
    title: form.title,
    subtitle: optional(form.subtitle),
    body: form.body,
    data: JSON.parse(form.data || '{}'),
    badge: form.badge === '' ? undefined : Number(form.badge),
    sound: form.isSound,
    vibrate:
      form.vibrate === '' ? undefined : form.vibrate.split(',').map(Number),
    categoryIdentifier: optional(form.categoryIdentifier),
    interruptionLevel: form.level,
    sticky: form.isSticky,
    autoDismiss: form.isAutoDismiss,
  };
}

export function triggerOf(
  form: IScheduleForm,
): ISchedulableNotificationTriggerInput {
  const channelId = optional(form.channelId);
  const at = { hour: Number(form.hour), minute: Number(form.minute) };
  switch (form.kind) {
    case SchedulableTriggerInputTypes.DATE:
      return {
        type: form.kind,
        date: Date.now() + Number(form.seconds) * MS_PER_SECOND,
        channelId,
      };
    case SchedulableTriggerInputTypes.DAILY:
      return { type: form.kind, channelId, ...at };
    case SchedulableTriggerInputTypes.WEEKLY:
      return {
        type: form.kind,
        channelId,
        weekday: Number(form.weekday),
        ...at,
      };
    case SchedulableTriggerInputTypes.MONTHLY:
      return { type: form.kind, channelId, day: Number(form.day), ...at };
    case SchedulableTriggerInputTypes.YEARLY:
      return {
        type: form.kind,
        channelId,
        day: Number(form.day),
        month: Number(form.month),
        ...at,
      };
    case SchedulableTriggerInputTypes.CALENDAR:
      return {
        type: form.kind,
        channelId,
        repeats: form.isRepeats,
        weekday: Number(form.weekday),
        ...at,
      };
    default:
      return {
        type: SchedulableTriggerInputTypes.TIME_INTERVAL,
        channelId,
        repeats: form.isRepeats,
        seconds: Number(form.seconds),
      };
  }
}
