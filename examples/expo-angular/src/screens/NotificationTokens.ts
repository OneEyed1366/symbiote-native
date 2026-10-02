import { Component, computed, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  BackgroundNotificationTaskResult,
  addPushTokenListener,
  getDevicePushTokenAsync,
  getExpoPushTokenAsync,
  installPushTokenAutoRegistration,
  registerTaskAsync,
  setAutoServerRegistrationEnabledAsync,
  subscribeToTopicAsync,
  unregisterForNotificationsAsync,
  unregisterTaskAsync,
  unsubscribeFromTopicAsync,
} from '@symbiote-native/notifications/angular';
import { defineTask } from '@symbiote-native/task-manager';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const TASK_NAME = 'symbiote-canary-notification-task';
const MAX_LOGGED_EVENTS = 5;
const taskLog: string[] = [];

defineTask(TASK_NAME, async ({ data, error }) => {
  taskLog.unshift(
    error
      ? `task error: ${error.message}`
      : `task data: ${JSON.stringify(data)}`,
  );
  taskLog.length = Math.min(taskLog.length, MAX_LOGGED_EVENTS);
  return BackgroundNotificationTaskResult.NewData;
});

@Component({
  selector: 'NotificationTokens',
  standalone: true,
  imports: [CallConsole, Card, Field, SYMBIOTE_ELEMENTS, ToggleRow],
  template: `
    <Card testID="notifications-token-form-card" title="Token inputs">
      <Field
        testID="notifications-project-input"
        label="projectId (EAS project, required for Expo tokens)"
        [(value)]="projectId"
      />
      <Field
        testID="notifications-topic-input"
        label="topic (Android FCM)"
        [(value)]="topic"
      />
      <Field
        testID="notifications-base-url-input"
        label="baseUrl override"
        [(value)]="baseUrl"
      />
      <ToggleRow
        testID="notifications-development-switch"
        label="development"
        [(value)]="isDevelopment"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-auto-switch"
        label="setAutoServerRegistrationEnabledAsync"
        [(value)]="isAutoRegistration"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="notifications-tokens"
      title="Push tokens"
      [color]="color"
      [calls]="tokenCalls"
    />
    <text testID="notifications-token-events" class="info-text">{{
      eventsText()
    }}</text>
    <CallConsole
      prefix="notifications-background"
      title="Background notification task"
      [color]="color"
      hint="The task is defined at module scope with defineTask from task-manager."
      [calls]="backgroundCalls"
    />
  `,
})
export class NotificationTokens {
  readonly color = lineColorOf(ROUTE_NAME.Notifications);

  readonly projectId = signal('');
  readonly topic = signal('canary');
  readonly baseUrl = signal('');
  readonly isDevelopment = signal(false);
  readonly isAutoRegistration = signal(true);
  private readonly events = signal<string[]>([]);
  private remove: (() => void) | null = null;

  readonly eventsText = computed(() => {
    const events = this.events();
    return events.length === 0 ? 'no token events yet' : events.join('\n');
  });

  readonly tokenCalls = [
    { label: 'getDevicePushTokenAsync', run: () => getDevicePushTokenAsync() },
    {
      label: 'getExpoPushTokenAsync',
      run: () =>
        getExpoPushTokenAsync({
          projectId: this.projectId() === '' ? undefined : this.projectId(),
          baseUrl: this.baseUrl() === '' ? undefined : this.baseUrl(),
          development: this.isDevelopment(),
        }),
    },
    {
      label: 'setAutoServerRegistrationEnabledAsync',
      run: async () =>
        setAutoServerRegistrationEnabledAsync(this.isAutoRegistration()),
    },
    {
      label: 'installPushTokenAutoRegistration',
      run: async () => {
        this.remove = installPushTokenAutoRegistration();
        return 'installed';
      },
    },
    {
      label: 'remove auto registration',
      run: async () => {
        this.remove?.();
        return 'removed';
      },
    },
    {
      label: 'subscribeToTopicAsync',
      run: () => subscribeToTopicAsync(this.topic()),
    },
    {
      label: 'unsubscribeFromTopicAsync',
      run: () => unsubscribeFromTopicAsync(this.topic()),
    },
    {
      label: 'unregisterForNotificationsAsync',
      run: () => unregisterForNotificationsAsync(),
    },
    {
      label: 'addPushTokenListener',
      run: async () => {
        const subscription = addPushTokenListener(token => {
          this.events.update(events =>
            [`${token.type}: ${token.data}`, ...events].slice(
              0,
              MAX_LOGGED_EVENTS,
            ),
          );
        });
        return subscription ? 'listening' : 'no subscription';
      },
    },
  ];

  readonly backgroundCalls = [
    { label: 'registerTaskAsync', run: () => registerTaskAsync(TASK_NAME) },
    { label: 'unregisterTaskAsync', run: () => unregisterTaskAsync(TASK_NAME) },
    { label: 'task log', run: async () => taskLog },
    {
      label: 'BackgroundNotificationTaskResult',
      run: async () => BackgroundNotificationTaskResult,
    },
  ];
}
