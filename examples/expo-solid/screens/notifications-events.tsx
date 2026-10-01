import { createSignal, onCleanup, onMount } from 'solid-js';
import {
  DEFAULT_ACTION_IDENTIFIER,
  addNotificationReceivedListener,
  addNotificationResponseClearedListener,
  addNotificationResponseReceivedListener,
  addNotificationsDroppedListener,
  clearLastNotificationResponse,
  clearLastNotificationResponseAsync,
  createLastNotificationResponse,
  determineNextResponse,
  getLastNotificationResponse,
  getLastNotificationResponseAsync,
} from '@symbiote-native/notifications/solid';
import { CallConsole } from '../components/CallConsole';
import { Card, ResultRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Notifications);
const MAX_LOGGED_EVENTS = 6;

function createEventLog() {
  const [lines, setLines] = createSignal<string[]>([]);
  onMount(() => {
    const push = (line: string) => setLines(previous => [line, ...previous].slice(0, MAX_LOGGED_EVENTS));
    const subscriptions = [
      addNotificationReceivedListener(event => push(`received ${event.request.identifier}: ${event.request.content.title ?? 'no title'}`)),
      addNotificationResponseReceivedListener(response => push(`response ${response.actionIdentifier}${response.userText === undefined ? '' : ` text=${response.userText}`}`)),
      addNotificationResponseClearedListener(() => push('response cleared')),
      addNotificationsDroppedListener(() => push('notifications dropped')),
    ];
    onCleanup(() => subscriptions.forEach(subscription => subscription.remove()));
  });
  return lines;
}

function ResponseCard() {
  const response = createLastNotificationResponse();
  const isDefault = () => response()?.actionIdentifier === DEFAULT_ACTION_IDENTIFIER;
  const state = () => {
    const current = response();
    if (current === undefined) {
      return 'loading';
    }
    return current === null ? 'none' : 'received';
  };
  const action = () => {
    const current = response();
    if (current === undefined || current === null) {
      return 'none';
    }
    return `${current.actionIdentifier}${isDefault() ? ' (DEFAULT_ACTION_IDENTIFIER)' : ''}`;
  };
  return (
    <Card testID="notifications-response-card" title="useLastNotificationResponse">
      <ResultRow testID="notifications-response-state" label="state" value={state()} />
      <ResultRow testID="notifications-response-id" label="request identifier" value={response()?.notification.request.identifier ?? 'none'} />
      <ResultRow testID="notifications-response-action" label="actionIdentifier" value={action()} />
      <ResultRow testID="notifications-response-text" label="userText" value={response()?.userText ?? 'none'} />
    </Card>
  );
}

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

export function EventCards() {
  const lines = createEventLog();
  return (
    <>
      <Card testID="notifications-events-card" title="Listeners">
        <text class="info-text">
          addNotificationReceivedListener, addNotificationResponseReceivedListener, addNotificationResponseClearedListener and addNotificationsDroppedListener are all attached while this screen is open.
        </text>
        <text testID="notifications-event-log" class="info-text">{lines().length === 0 ? 'no events yet, schedule a notification and tap it' : lines().join('\n')}</text>
      </Card>
      <ResponseCard />
      <ResponseCalls />
    </>
  );
}
