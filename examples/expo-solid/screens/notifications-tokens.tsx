import { createSignal } from 'solid-js';
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
} from '@symbiote-native/notifications/solid';
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

function FormCard(props: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="notifications-token-form-card" title="Token inputs">
      <Field testID="notifications-project-input" label="projectId (EAS project, required for Expo tokens)" value={props.form.projectId} onChange={projectId => props.setForm({ projectId })} />
      <Field testID="notifications-topic-input" label="topic (Android FCM)" value={props.form.topic} onChange={topic => props.setForm({ topic })} />
      <Field testID="notifications-base-url-input" label="baseUrl override" value={props.form.baseUrl} onChange={baseUrl => props.setForm({ baseUrl })} />
      <ToggleRow testID="notifications-development-switch" label="development" value={props.form.isDevelopment} onChange={isDevelopment => props.setForm({ isDevelopment })} color={color} />
      <ToggleRow testID="notifications-auto-switch" label="setAutoServerRegistrationEnabledAsync" value={props.form.isAutoRegistration} onChange={isAutoRegistration => props.setForm({ isAutoRegistration })} color={color} />
    </Card>
  );
}

function TokenCalls(props: { form: IForm }) {
  let remove: (() => void) | null = null;
  const [events, setEvents] = createSignal<string[]>([]);
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
                projectId: props.form.projectId === '' ? undefined : props.form.projectId,
                baseUrl: props.form.baseUrl === '' ? undefined : props.form.baseUrl,
                development: props.form.isDevelopment,
              }),
          },
          { label: 'setAutoServerRegistrationEnabledAsync', run: async () => setAutoServerRegistrationEnabledAsync(props.form.isAutoRegistration) },
          { label: 'installPushTokenAutoRegistration', run: async () => { remove = installPushTokenAutoRegistration(); return 'installed'; } },
          { label: 'remove auto registration', run: async () => { remove?.(); return 'removed'; } },
          { label: 'subscribeToTopicAsync', run: () => subscribeToTopicAsync(props.form.topic) },
          { label: 'unsubscribeFromTopicAsync', run: () => unsubscribeFromTopicAsync(props.form.topic) },
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
      <text testID="notifications-token-events" class="info-text">{events().length === 0 ? 'no token events yet' : events().join('\n')}</text>
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
  const [form, setFormState] = createSignal<IForm>({ projectId: '', topic: 'canary', baseUrl: '', isDevelopment: false, isAutoRegistration: true });
  const setForm: ISetForm = patch => setFormState(previous => ({ ...previous, ...patch }));
  return (
    <>
      <FormCard form={form()} setForm={setForm} />
      <TokenCalls form={form()} />
      <BackgroundCalls />
    </>
  );
}
