import { Component, signal } from '@angular/core';
import {
  cancelAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync,
  dismissAllNotificationsAsync,
  dismissNotificationAsync,
  getAllScheduledNotificationsAsync,
  getNextTriggerDateAsync,
  getPresentedNotificationsAsync,
  scheduleNotificationAsync,
} from '@symbiote-native/notifications/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
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

@Component({
  selector: 'NotificationSchedule',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card testID="notifications-content-card" title="Notification content">
      <Field
        testID="notifications-title-input"
        label="title"
        [value]="form().title"
        (valueChange)="patch({ title: $event })"
      />
      <Field
        testID="notifications-subtitle-input"
        label="subtitle (iOS)"
        [value]="form().subtitle"
        (valueChange)="patch({ subtitle: $event })"
      />
      <Field
        testID="notifications-body-input"
        label="body"
        [value]="form().body"
        (valueChange)="patch({ body: $event })"
      />
      <Field
        testID="notifications-data-input"
        label="data (JSON)"
        [value]="form().data"
        (valueChange)="patch({ data: $event })"
      />
      <Field
        testID="notifications-content-badge-input"
        label="badge"
        [value]="form().badge"
        (valueChange)="patch({ badge: $event })"
      />
      <Field
        testID="notifications-vibrate-input"
        label="vibrate (Android, comma separated ms)"
        [value]="form().vibrate"
        (valueChange)="patch({ vibrate: $event })"
      />
      <Field
        testID="notifications-category-input"
        label="categoryIdentifier"
        [value]="form().categoryIdentifier"
        (valueChange)="patch({ categoryIdentifier: $event })"
      />
      <ChoiceRow
        testID="notifications-level"
        label="interruptionLevel (iOS)"
        [options]="levels"
        [value]="form().level"
        (valueChange)="patch({ level: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-content-sound-switch"
        label="sound"
        [value]="form().isSound"
        (valueChange)="patch({ isSound: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-sticky-switch"
        label="sticky (Android)"
        [value]="form().isSticky"
        (valueChange)="patch({ isSticky: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-autodismiss-switch"
        label="autoDismiss (Android)"
        [value]="form().isAutoDismiss"
        (valueChange)="patch({ isAutoDismiss: $event })"
        [color]="color"
      />
    </Card>
    <Card testID="notifications-trigger-card" title="Trigger">
      <ChoiceRow
        testID="notifications-kind"
        label="SchedulableTriggerInputTypes"
        [options]="kinds"
        [value]="form().kind"
        (valueChange)="patch({ kind: $event })"
        [color]="color"
      />
      <Field
        testID="notifications-channel-input"
        label="channelId (Android)"
        [value]="form().channelId"
        (valueChange)="patch({ channelId: $event })"
      />
      <Field
        testID="notifications-seconds-input"
        label="seconds (TIME_INTERVAL, DATE offset)"
        [value]="form().seconds"
        (valueChange)="patch({ seconds: $event })"
      />
      <ToggleRow
        testID="notifications-repeats-switch"
        label="repeats (TIME_INTERVAL, CALENDAR)"
        [value]="form().isRepeats"
        (valueChange)="patch({ isRepeats: $event })"
        [color]="color"
      />
      <Field
        testID="notifications-hour-input"
        label="hour"
        [value]="form().hour"
        (valueChange)="patch({ hour: $event })"
      />
      <Field
        testID="notifications-minute-input"
        label="minute"
        [value]="form().minute"
        (valueChange)="patch({ minute: $event })"
      />
      <Field
        testID="notifications-weekday-input"
        label="weekday (1 is Sunday)"
        [value]="form().weekday"
        (valueChange)="patch({ weekday: $event })"
      />
      <Field
        testID="notifications-day-input"
        label="day"
        [value]="form().day"
        (valueChange)="patch({ day: $event })"
      />
      <Field
        testID="notifications-month-input"
        label="month"
        [value]="form().month"
        (valueChange)="patch({ month: $event })"
      />
      <Field
        testID="notifications-identifier-input"
        label="identifier (cancel and dismiss)"
        [value]="form().identifier"
        (valueChange)="patch({ identifier: $event })"
      />
    </Card>
    <CallConsole
      prefix="notifications-schedule"
      title="Scheduler"
      [color]="color"
      hint="Background the app after scheduling to see the notification banner."
      [calls]="scheduleCalls"
    />
    <CallConsole
      prefix="notifications-presented"
      title="Presented notifications"
      [color]="color"
      [calls]="presentedCalls"
    />
  `,
})
export class NotificationSchedule {
  readonly color = lineColorOf(ROUTE_NAME.Notifications);
  readonly kinds = KINDS;
  readonly levels = LEVELS;

  readonly form = signal<IScheduleForm>({ ...INITIAL_SCHEDULE_FORM });

  readonly scheduleCalls = [
    {
      label: 'scheduleNotificationAsync',
      run: () =>
        scheduleNotificationAsync({
          content: contentOf(this.form()),
          trigger: triggerOf(this.form()),
        }),
    },
    {
      label: 'scheduleNotificationAsync (null trigger, now)',
      run: () =>
        scheduleNotificationAsync({
          content: contentOf(this.form()),
          trigger: null,
        }),
    },
    {
      label: 'scheduleNotificationAsync (identifier)',
      run: () =>
        scheduleNotificationAsync({
          identifier: this.form().identifier,
          content: contentOf(this.form()),
          trigger: triggerOf(this.form()),
        }),
    },
    {
      label: 'getNextTriggerDateAsync',
      run: async () => {
        const next = await getNextTriggerDateAsync(triggerOf(this.form()));
        return next === null ? null : new Date(next).toISOString();
      },
    },
    {
      label: 'getAllScheduledNotificationsAsync',
      run: () => getAllScheduledNotificationsAsync(),
    },
    {
      label: 'cancelScheduledNotificationAsync',
      run: () => cancelScheduledNotificationAsync(this.form().identifier),
    },
    {
      label: 'cancelAllScheduledNotificationsAsync',
      run: () => cancelAllScheduledNotificationsAsync(),
    },
  ];

  readonly presentedCalls = [
    {
      label: 'getPresentedNotificationsAsync',
      run: () => getPresentedNotificationsAsync(),
    },
    {
      label: 'dismissNotificationAsync',
      run: () => dismissNotificationAsync(this.form().identifier),
    },
    {
      label: 'dismissAllNotificationsAsync',
      run: () => dismissAllNotificationsAsync(),
    },
  ];

  patch(change: Partial<IScheduleForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }
}
