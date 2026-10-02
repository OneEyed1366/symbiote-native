<script lang="ts">
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
  } from '@symbiote-native/notifications/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.Notifications);
  const MAX_LOGGED_EVENTS = 6;

  let lines = $state<string[]>([]);

  function push(line: string): void {
    lines = [line, ...lines].slice(0, MAX_LOGGED_EVENTS);
  }

  $effect(() => {
    const subscriptions = [
      addNotificationReceivedListener(event => {
        push(`received ${event.request.identifier}: ${event.request.content.title ?? 'no title'}`);
      }),
      addNotificationResponseReceivedListener(response => {
        push(
          `response ${response.actionIdentifier}${response.userText === undefined ? '' : ` text=${response.userText}`}`,
        );
      }),
      addNotificationResponseClearedListener(() => push('response cleared')),
      addNotificationsDroppedListener(() => push('notifications dropped')),
    ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  });

  const lastResponse = useLastNotificationResponse();
  const response = $derived(lastResponse.current);

  const responseState = $derived.by((): string => {
    if (response === undefined) {
      return 'loading';
    }
    return response === null ? 'none' : 'received';
  });
  const responseAction = $derived.by((): string => {
    if (response === undefined || response === null) {
      return 'none';
    }
    const suffix =
      response.actionIdentifier === DEFAULT_ACTION_IDENTIFIER ? ' (DEFAULT_ACTION_IDENTIFIER)' : '';
    return `${response.actionIdentifier}${suffix}`;
  });
</script>

<Card testID="notifications-events-card" title="Listeners">
  <text class="info-text">
    addNotificationReceivedListener, addNotificationResponseReceivedListener, addNotificationResponseClearedListener and addNotificationsDroppedListener are all attached while this screen is open.
  </text>
  <text testID="notifications-event-log" class="info-text">
    {lines.length === 0 ? 'no events yet, schedule a notification and tap it' : lines.join('\n')}
  </text>
</Card>
<Card testID="notifications-response-card" title="useLastNotificationResponse">
  <ResultRow testID="notifications-response-state" label="state" value={responseState} />
  <ResultRow
    testID="notifications-response-id"
    label="request identifier"
    value={response?.notification.request.identifier ?? 'none'}
  />
  <ResultRow testID="notifications-response-action" label="actionIdentifier" value={responseAction} />
  <ResultRow testID="notifications-response-text" label="userText" value={response?.userText ?? 'none'} />
</Card>
<CallConsole
  prefix="notifications-last"
  title="Last response"
  {color}
  calls={[
    { label: 'getLastNotificationResponse', run: async () => getLastNotificationResponse() },
    {
      label: 'getLastNotificationResponseAsync',
      run: () => getLastNotificationResponseAsync(),
    },
    {
      label: 'clearLastNotificationResponse',
      run: async () => clearLastNotificationResponse(),
    },
    {
      label: 'clearLastNotificationResponseAsync',
      run: () => clearLastNotificationResponseAsync(),
    },
    { label: 'DEFAULT_ACTION_IDENTIFIER', run: async () => DEFAULT_ACTION_IDENTIFIER },
    {
      label: 'determineNextResponse (null clears)',
      run: async () => determineNextResponse(getLastNotificationResponse(), null),
    },
  ]}
/>
