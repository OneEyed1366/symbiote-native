<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
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
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ResultRow from '../components/ResultRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Notifications);
const MAX_LOGGED_EVENTS = 6;

const lines = ref<string[]>([]);

function push(line: string): void {
  lines.value = [line, ...lines.value].slice(0, MAX_LOGGED_EVENTS);
}

let subscriptions: { remove: () => void }[] = [];

onMounted(() => {
  subscriptions = [
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
});

onUnmounted(() => {
  subscriptions.forEach(subscription => subscription.remove());
  subscriptions = [];
});

const lastResponse = useLastNotificationResponse();
const response = computed(() => lastResponse.value);

const responseState = computed((): string => {
  if (response.value === undefined) {
    return 'loading';
  }
  return response.value === null ? 'none' : 'received';
});

const responseAction = computed((): string => {
  const current = response.value;
  if (current === undefined || current === null) {
    return 'none';
  }
  const suffix =
    current.actionIdentifier === DEFAULT_ACTION_IDENTIFIER ? ' (DEFAULT_ACTION_IDENTIFIER)' : '';
  return `${current.actionIdentifier}${suffix}`;
});

const requestId = computed(() => response.value?.notification.request.identifier ?? 'none');
const userText = computed(() => response.value?.userText ?? 'none');

const lastCalls = [
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
];
</script>

<template>
  <Card testID="notifications-events-card" title="Listeners">
    <text class="info-text">
      addNotificationReceivedListener, addNotificationResponseReceivedListener,
      addNotificationResponseClearedListener and addNotificationsDroppedListener are all attached
      while this screen is open.
    </text>
    <text testID="notifications-event-log" class="info-text">
      {{ lines.length === 0 ? 'no events yet, schedule a notification and tap it' : lines.join('\n') }}
    </text>
  </Card>
  <Card testID="notifications-response-card" title="useLastNotificationResponse">
    <ResultRow testID="notifications-response-state" label="state" :value="responseState" />
    <ResultRow testID="notifications-response-id" label="request identifier" :value="requestId" />
    <ResultRow
      testID="notifications-response-action"
      label="actionIdentifier"
      :value="responseAction"
    />
    <ResultRow testID="notifications-response-text" label="userText" :value="userText" />
  </Card>
  <CallConsole prefix="notifications-last" title="Last response" :color="color" :calls="lastCalls" />
</template>
