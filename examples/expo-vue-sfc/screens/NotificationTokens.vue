<script lang="ts">
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
} from '@symbiote-native/notifications/vue';
import { defineTask } from '@symbiote-native/task-manager';

const TASK_NAME = 'symbiote-canary-notification-task';
const MAX_LOGGED_EVENTS = 5;
const taskLog: string[] = [];

defineTask(TASK_NAME, async ({ data, error }) => {
  taskLog.unshift(error ? `task error: ${error.message}` : `task data: ${JSON.stringify(data)}`);
  taskLog.length = Math.min(taskLog.length, MAX_LOGGED_EVENTS);
  return BackgroundNotificationTaskResult.NewData;
});
</script>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Notifications);

type ITokenForm = {
  projectId: string;
  topic: string;
  baseUrl: string;
  isDevelopment: boolean;
  isAutoRegistration: boolean;
};

const form = reactive<ITokenForm>({
  projectId: '',
  topic: 'canary',
  baseUrl: '',
  isDevelopment: false,
  isAutoRegistration: true,
});
const events = ref<string[]>([]);
let remove: (() => void) | null = null;

const tokenCalls = [
  { label: 'getDevicePushTokenAsync', run: () => getDevicePushTokenAsync() },
  {
    label: 'getExpoPushTokenAsync',
    run: () =>
      getExpoPushTokenAsync({
        projectId: form.projectId === '' ? undefined : form.projectId,
        baseUrl: form.baseUrl === '' ? undefined : form.baseUrl,
        development: form.isDevelopment,
      }),
  },
  {
    label: 'setAutoServerRegistrationEnabledAsync',
    run: async () => setAutoServerRegistrationEnabledAsync(form.isAutoRegistration),
  },
  {
    label: 'installPushTokenAutoRegistration',
    run: async () => {
      remove = installPushTokenAutoRegistration();
      return 'installed';
    },
  },
  {
    label: 'remove auto registration',
    run: async () => {
      remove?.();
      return 'removed';
    },
  },
  { label: 'subscribeToTopicAsync', run: () => subscribeToTopicAsync(form.topic) },
  { label: 'unsubscribeFromTopicAsync', run: () => unsubscribeFromTopicAsync(form.topic) },
  { label: 'unregisterForNotificationsAsync', run: () => unregisterForNotificationsAsync() },
  {
    label: 'addPushTokenListener',
    run: async () => {
      const subscription = addPushTokenListener(token => {
        events.value = [`${token.type}: ${token.data}`, ...events.value].slice(0, MAX_LOGGED_EVENTS);
      });
      return subscription ? 'listening' : 'no subscription';
    },
  },
];

const backgroundCalls = [
  { label: 'registerTaskAsync', run: () => registerTaskAsync(TASK_NAME) },
  { label: 'unregisterTaskAsync', run: () => unregisterTaskAsync(TASK_NAME) },
  { label: 'task log', run: async () => taskLog },
  { label: 'BackgroundNotificationTaskResult', run: async () => BackgroundNotificationTaskResult },
];
</script>

<template>
  <Card testID="notifications-token-form-card" title="Token inputs">
    <Field
      testID="notifications-project-input"
      label="projectId (EAS project, required for Expo tokens)"
      :value="form.projectId"
      :onChange="projectId => (form.projectId = projectId)"
    />
    <Field
      testID="notifications-topic-input"
      label="topic (Android FCM)"
      :value="form.topic"
      :onChange="topic => (form.topic = topic)"
    />
    <Field
      testID="notifications-base-url-input"
      label="baseUrl override"
      :value="form.baseUrl"
      :onChange="baseUrl => (form.baseUrl = baseUrl)"
    />
    <ToggleRow
      testID="notifications-development-switch"
      label="development"
      :value="form.isDevelopment"
      :onChange="isDevelopment => (form.isDevelopment = isDevelopment)"
      :color="color"
    />
    <ToggleRow
      testID="notifications-auto-switch"
      label="setAutoServerRegistrationEnabledAsync"
      :value="form.isAutoRegistration"
      :onChange="isAutoRegistration => (form.isAutoRegistration = isAutoRegistration)"
      :color="color"
    />
  </Card>
  <CallConsole prefix="notifications-tokens" title="Push tokens" :color="color" :calls="tokenCalls" />
  <text testID="notifications-token-events" class="info-text">
    {{ events.length === 0 ? 'no token events yet' : events.join('\n') }}
  </text>
  <CallConsole
    prefix="notifications-background"
    title="Background notification task"
    :color="color"
    hint="The task is defined at module scope with defineTask from task-manager."
    :calls="backgroundCalls"
  />
</template>
