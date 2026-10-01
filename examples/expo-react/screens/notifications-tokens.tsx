import { useRef, useState } from 'react';
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
} from '@symbiote-native/notifications/react';
import { defineTask } from '@symbiote-native/task-manager';
import { CallConsole } from '../components/CallConsole';
import { Card, Field, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Notifications);
const TASK_NAME = 'symbiote-canary-notification-task';
const MAX_LOGGED_EVENTS = 5;
const taskLog: string[] = [];

defineTask(TASK_NAME, async ({ data, error }) => {
  taskLog.unshift(error ? `task error: ${error.message}` : `task data: ${JSON.stringify(data)}`);
  taskLog.length = Math.min(taskLog.length, MAX_LOGGED_EVENTS);
  return BackgroundNotificationTaskResult.NewData;
});

type IForm = { projectId: string; topic: string; baseUrl: string; isDevelopment: boolean; isAutoRegistration: boolean };
type ISetForm = (patch: Partial<IForm>) => void;

function FormCard({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="notifications-token-form-card" title="Token inputs">
      <Field testID="notifications-project-input" label="projectId (EAS project, required for Expo tokens)" value={form.projectId} onChange={projectId => setForm({ projectId })} />
      <Field testID="notifications-topic-input" label="topic (Android FCM)" value={form.topic} onChange={topic => setForm({ topic })} />
      <Field testID="notifications-base-url-input" label="baseUrl override" value={form.baseUrl} onChange={baseUrl => setForm({ baseUrl })} />
      <ToggleRow testID="notifications-development-switch" label="development" value={form.isDevelopment} onChange={isDevelopment => setForm({ isDevelopment })} color={color} />
      <ToggleRow testID="notifications-auto-switch" label="setAutoServerRegistrationEnabledAsync" value={form.isAutoRegistration} onChange={isAutoRegistration => setForm({ isAutoRegistration })} color={color} />
    </Card>
  );
}

function TokenCalls({ form }: { form: IForm }) {
  const remove = useRef<(() => void) | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  return (
    <>
      <CallConsole
        prefix="notifications-tokens"
        title="Push tokens"
        color={color}
        calls={[
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
          { label: 'setAutoServerRegistrationEnabledAsync', run: async () => setAutoServerRegistrationEnabledAsync(form.isAutoRegistration) },
          { label: 'installPushTokenAutoRegistration', run: async () => { remove.current = installPushTokenAutoRegistration(); return 'installed'; } },
          { label: 'remove auto registration', run: async () => { remove.current?.(); return 'removed'; } },
          { label: 'subscribeToTopicAsync', run: () => subscribeToTopicAsync(form.topic) },
          { label: 'unsubscribeFromTopicAsync', run: () => unsubscribeFromTopicAsync(form.topic) },
          { label: 'unregisterForNotificationsAsync', run: () => unregisterForNotificationsAsync() },
          {
            label: 'addPushTokenListener',
            run: async () => {
              const subscription = addPushTokenListener(token => setEvents(previous => [`${token.type}: ${token.data}`, ...previous].slice(0, MAX_LOGGED_EVENTS)));
              return subscription ? 'listening' : 'no subscription';
            },
          },
        ]}
      />
      <text testID="notifications-token-events" className="info-text">{events.length === 0 ? 'no token events yet' : events.join('\n')}</text>
    </>
  );
}

function BackgroundCalls() {
  return (
    <CallConsole
      prefix="notifications-background"
      title="Background notification task"
      color={color}
      hint="The task is defined at module scope with defineTask from task-manager."
      calls={[
        { label: 'registerTaskAsync', run: () => registerTaskAsync(TASK_NAME) },
        { label: 'unregisterTaskAsync', run: () => unregisterTaskAsync(TASK_NAME) },
        { label: 'task log', run: async () => taskLog },
        { label: 'BackgroundNotificationTaskResult', run: async () => BackgroundNotificationTaskResult },
      ]}
    />
  );
}

export function TokenCards() {
  const [form, setFormState] = useState<IForm>({ projectId: '', topic: 'canary', baseUrl: '', isDevelopment: false, isAutoRegistration: true });
  const setForm: ISetForm = patch => setFormState(previous => ({ ...previous, ...patch }));
  return (
    <>
      <FormCard form={form} setForm={setForm} />
      <TokenCalls form={form} />
      <BackgroundCalls />
    </>
  );
}
