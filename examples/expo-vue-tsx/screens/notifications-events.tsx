import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import {
  DEFAULT_ACTION_IDENTIFIER,
  addNotificationReceivedListener,
  addNotificationResponseClearedListener,
  addNotificationResponseReceivedListener,
  addNotificationsDroppedListener,
  clearLastNotificationResponse,
  clearLastNotificationResponseAsync,
  determineNextResponse,
  getLastNotificationResponse,
  getLastNotificationResponseAsync,
  useLastNotificationResponse,
} from '@symbiote-native/notifications/vue';
import { CallConsole } from '../components/CallConsole';
import { Card, ResultRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Notifications);
const MAX_LOGGED_EVENTS = 6;

function useEventLog() {
  const lines = ref<string[]>([]);
  let subscriptions: { remove: () => void }[] = [];
  const push = (line: string) => {
    lines.value = [line, ...lines.value].slice(0, MAX_LOGGED_EVENTS);
  };
  onMounted(() => {
    subscriptions = [
      addNotificationReceivedListener(event => push(`received ${event.request.identifier}: ${event.request.content.title ?? 'no title'}`)),
      addNotificationResponseReceivedListener(response => push(`response ${response.actionIdentifier}${response.userText === undefined ? '' : ` text=${response.userText}`}`)),
      addNotificationResponseClearedListener(() => push('response cleared')),
      addNotificationsDroppedListener(() => push('notifications dropped')),
    ];
  });
  onUnmounted(() => subscriptions.forEach(subscription => subscription.remove()));
  return lines;
}

const ResponseCard = defineComponent(
  () => {
    const response = useLastNotificationResponse();
    const state = () => {
      const current = response.value;
      if (current === undefined) {
        return 'loading';
      }
      return current === null ? 'none' : 'received';
    };
    const action = () => {
      const current = response.value;
      if (current === undefined || current === null) {
        return 'none';
      }
      const isDefault = current.actionIdentifier === DEFAULT_ACTION_IDENTIFIER;
      return `${current.actionIdentifier}${isDefault ? ' (DEFAULT_ACTION_IDENTIFIER)' : ''}`;
    };
    return () => (
      <Card testID="notifications-response-card" title="useLastNotificationResponse">
        <ResultRow testID="notifications-response-state" label="state" value={state()} />
        <ResultRow testID="notifications-response-id" label="request identifier" value={response.value?.notification.request.identifier ?? 'none'} />
        <ResultRow testID="notifications-response-action" label="actionIdentifier" value={action()} />
        <ResultRow testID="notifications-response-text" label="userText" value={response.value?.userText ?? 'none'} />
      </Card>
    );
  },
  { name: 'ResponseCard' },
);

function ResponseCalls() {
  return (
    <CallConsole
      prefix="notifications-last"
      title="Last response"
      color={color}
      calls={[
        { label: 'getLastNotificationResponse', run: async () => getLastNotificationResponse() },
        { label: 'getLastNotificationResponseAsync', run: () => getLastNotificationResponseAsync() },
        { label: 'clearLastNotificationResponse', run: async () => clearLastNotificationResponse() },
        { label: 'clearLastNotificationResponseAsync', run: () => clearLastNotificationResponseAsync() },
        { label: 'DEFAULT_ACTION_IDENTIFIER', run: async () => DEFAULT_ACTION_IDENTIFIER },
        { label: 'determineNextResponse (null clears)', run: async () => determineNextResponse(getLastNotificationResponse(), null) },
      ]}
    />
  );
}

export const EventCards = defineComponent(
  () => {
    const lines = useEventLog();
    return () => (
      <>
        <Card testID="notifications-events-card" title="Listeners">
          <text class="info-text">
            addNotificationReceivedListener, addNotificationResponseReceivedListener, addNotificationResponseClearedListener and addNotificationsDroppedListener are all attached while this screen is open.
          </text>
          <text testID="notifications-event-log" class="info-text">{lines.value.length === 0 ? 'no events yet, schedule a notification and tap it' : lines.value.join('\n')}</text>
        </Card>
        <ResponseCard />
        <ResponseCalls />
      </>
    );
  },
  { name: 'EventCards' },
);
