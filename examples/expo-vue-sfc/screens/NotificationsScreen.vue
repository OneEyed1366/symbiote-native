<!--
  @symbiote-native/notifications tour stop — permissions, scheduling (a short time-interval
  trigger + cancel-all/list), immediate presentation (trigger: null) + dismiss-all/list, the
  badge count, an Android-only notification channel card (gated the same way FileSystemScreen
  gates its Storage Access Framework card), and a received/response listener log. First port of
  this screen across the example suite — no React/Svelte/Solid/Angular twin to mirror yet.
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  AndroidImportance,
  cancelAllScheduledNotificationsAsync,
  dismissAllNotificationsAsync,
  getAllScheduledNotificationsAsync,
  getBadgeCountAsync,
  getNotificationChannelsAsync,
  getPermissionsAsync,
  getPresentedNotificationsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setBadgeCountAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
  SchedulableTriggerInputTypes,
} from '@symbiote-native/notifications/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DEMO_CHANNEL_ID = 'symbiote-canary-demo';
const MAX_LOGGED_EVENTS = 5;

// Lets a presented notification actually show while this screen is foregrounded — the README's
// own "Use it" example does the same, at module scope, once.
setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Notifications];
const lineColor = LINE_COLOR[lineInfo.line];

// Permissions
const permissionStatusText = ref('not checked yet');

function handleRequestPermission(): void {
  void requestPermissionsAsync()
    .then(response => {
      permissionStatusText.value = response.status;
    })
    .catch((error: Error) => {
      permissionStatusText.value = `request failed: ${error.message}`;
    });
}

function handleGetPermission(): void {
  void getPermissionsAsync()
    .then(response => {
      permissionStatusText.value = response.status;
    })
    .catch((error: Error) => {
      permissionStatusText.value = `get failed: ${error.message}`;
    });
}

// Scheduling
const scheduleStatusText = ref('not scheduled yet');
const scheduledListText = ref('No scheduled notifications loaded yet.');
const scheduleError = ref<string | null>(null);

function handleSchedule(): void {
  scheduleError.value = null;
  void scheduleNotificationAsync({
    content: { title: 'Canary reminder', body: 'Scheduled a few seconds ago.' },
    trigger: { type: SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
  })
    .then(identifier => {
      scheduleStatusText.value = `scheduled ${identifier}`;
    })
    .catch((error: Error) => {
      scheduleError.value = `schedule failed: ${error.message}`;
    });
}

function handleCancelAllScheduled(): void {
  scheduleError.value = null;
  void cancelAllScheduledNotificationsAsync()
    .then(() => {
      scheduleStatusText.value = 'cancelled all scheduled';
    })
    .catch((error: Error) => {
      scheduleError.value = `cancel failed: ${error.message}`;
    });
}

function handleListScheduled(): void {
  scheduleError.value = null;
  void getAllScheduledNotificationsAsync()
    .then(requests => {
      scheduledListText.value =
        requests.length === 0
          ? 'No scheduled notifications.'
          : `${requests.length}: ${requests.map(request => request.identifier).join(', ')}`;
    })
    .catch((error: Error) => {
      scheduleError.value = `list failed: ${error.message}`;
    });
}

// Presentation
const presentStatusText = ref('not presented yet');
const presentedListText = ref('No presented notifications loaded yet.');
const presentError = ref<string | null>(null);

function handlePresentNow(): void {
  presentError.value = null;
  void scheduleNotificationAsync({
    content: { title: 'Canary — right now', body: 'Presented immediately.' },
    trigger: null,
  })
    .then(identifier => {
      presentStatusText.value = `presented ${identifier}`;
    })
    .catch((error: Error) => {
      presentError.value = `present failed: ${error.message}`;
    });
}

function handleDismissAll(): void {
  presentError.value = null;
  void dismissAllNotificationsAsync()
    .then(() => {
      presentStatusText.value = 'dismissed all presented';
    })
    .catch((error: Error) => {
      presentError.value = `dismiss failed: ${error.message}`;
    });
}

function handleListPresented(): void {
  presentError.value = null;
  void getPresentedNotificationsAsync()
    .then(notifications => {
      presentedListText.value =
        notifications.length === 0
          ? 'No presented notifications.'
          : `${notifications.length}: ${notifications.map(notification => notification.request.identifier).join(', ')}`;
    })
    .catch((error: Error) => {
      presentError.value = `list failed: ${error.message}`;
    });
}

// Badge
const badgeCountText = ref('not loaded yet');
const badgeError = ref<string | null>(null);
let badgeCount = 0;

function handleGetBadgeCount(): void {
  badgeError.value = null;
  void getBadgeCountAsync()
    .then(count => {
      badgeCount = count;
      badgeCountText.value = String(count);
    })
    .catch((error: Error) => {
      badgeError.value = `get failed: ${error.message}`;
    });
}

function setBadge(next: number): void {
  badgeError.value = null;
  const clamped = Math.max(0, next);
  void setBadgeCountAsync(clamped)
    .then(() => {
      badgeCount = clamped;
      badgeCountText.value = String(clamped);
    })
    .catch((error: Error) => {
      badgeError.value = `set failed: ${error.message}`;
    });
}

function handleIncrementBadge(): void {
  setBadge(badgeCount + 1);
}

function handleDecrementBadge(): void {
  setBadge(badgeCount - 1);
}

// Channel — Android only, mirrors FileSystemScreen's SAF card gating.
const channelStatusText = ref('not set yet');
const channelListText = ref('No channels loaded yet.');
const channelError = ref<string | null>(null);

function handleSetChannel(): void {
  channelError.value = null;
  void setNotificationChannelAsync(DEMO_CHANNEL_ID, {
    name: 'Canary demo channel',
    importance: AndroidImportance.DEFAULT,
  })
    .then(() => {
      channelStatusText.value = `set ${DEMO_CHANNEL_ID}`;
    })
    .catch((error: Error) => {
      channelError.value = `set channel failed: ${error.message}`;
    });
}

function handleListChannels(): void {
  channelError.value = null;
  void getNotificationChannelsAsync()
    .then(channels => {
      channelListText.value =
        channels.length === 0
          ? 'No channels.'
          : `${channels.length}: ${channels.map(channel => channel.id).join(', ')}`;
    })
    .catch((error: Error) => {
      channelError.value = `list failed: ${error.message}`;
    });
}

// Listeners — subscribed on mount, unsubscribed on unmount, last few events kept for display.
const eventLog = ref<string[]>([]);

function pushLogEntry(entry: string): void {
  eventLog.value = [entry, ...eventLog.value].slice(0, MAX_LOGGED_EVENTS);
}

const receivedSubscription = addNotificationReceivedListener(notification => {
  pushLogEntry(
    `received: ${notification.request.content.title ?? '(no title)'}`,
  );
});
const responseSubscription = addNotificationResponseReceivedListener(
  response => {
    pushLogEntry(
      `response: ${response.notification.request.content.title ?? '(no title)'}`,
    );
  },
);

onMounted(() => {
  handleGetBadgeCount();
});

onUnmounted(() => {
  receivedSubscription.remove();
  responseSubscription.remove();
});
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="notifications-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Notifications</text>
          <text testID="notifications-hero" class="hero-body"
            >@symbiote-native/notifications — permissions, scheduling,
            presentation, badges, Android channels, and event listeners.</text
          >
        </view>
      </view>

      <view testID="notifications-permission-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Permissions</text>
        </view>
        <text
          testID="notifications-permission-status"
          class="auth-value-text"
          >{{ permissionStatusText }}</text
        >
        <view class="button-row">
          <ActionButton
            testID="notifications-request-permission"
            title="Request"
            :onPress="handleRequestPermission"
            :color="lineColor"
          />
          <ActionButton
            testID="notifications-get-permission"
            title="Get"
            :onPress="handleGetPermission"
            :color="lineColor"
          />
        </view>
      </view>

      <view testID="notifications-schedule-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Schedule</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="notifications-schedule-start"
            title="Schedule (5s)"
            :onPress="handleSchedule"
            :color="lineColor"
          />
          <ActionButton
            testID="notifications-schedule-cancel-all"
            title="Cancel all"
            :onPress="handleCancelAllScheduled"
            :color="lineColor"
          />
          <ActionButton
            testID="notifications-schedule-list"
            title="List"
            :onPress="handleListScheduled"
            :color="lineColor"
          />
        </view>
        <text testID="notifications-schedule-status" class="auth-value-text">{{
          scheduleStatusText
        }}</text>
        <text testID="notifications-schedule-list-text" class="info-text">{{
          scheduledListText
        }}</text>
        <view v-if="scheduleError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ scheduleError }}</text>
        </view>
      </view>

      <view testID="notifications-present-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Present immediately</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="notifications-present-now"
            title="Present now"
            :onPress="handlePresentNow"
            :color="lineColor"
          />
          <ActionButton
            testID="notifications-present-dismiss-all"
            title="Dismiss all"
            :onPress="handleDismissAll"
            :color="lineColor"
          />
          <ActionButton
            testID="notifications-present-list"
            title="List"
            :onPress="handleListPresented"
            :color="lineColor"
          />
        </view>
        <text testID="notifications-present-status" class="auth-value-text">{{
          presentStatusText
        }}</text>
        <text testID="notifications-present-list-text" class="info-text">{{
          presentedListText
        }}</text>
        <view v-if="presentError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ presentError }}</text>
        </view>
      </view>

      <view testID="notifications-badge-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Badge count</text>
        </view>
        <text testID="notifications-badge-count" class="auth-value-text">{{
          badgeCountText
        }}</text>
        <view class="button-row">
          <ActionButton
            testID="notifications-badge-get"
            title="Get"
            :onPress="handleGetBadgeCount"
            :color="lineColor"
          />
          <ActionButton
            testID="notifications-badge-decrement"
            title="−1"
            :onPress="handleDecrementBadge"
            :color="lineColor"
          />
          <ActionButton
            testID="notifications-badge-increment"
            title="+1"
            :onPress="handleIncrementBadge"
            :color="lineColor"
          />
        </view>
        <view v-if="badgeError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ badgeError }}</text>
        </view>
      </view>

      <view
        v-if="Platform.OS === 'android'"
        testID="notifications-channel-card"
        class="auth-card"
      >
        <view class="auth-card-header">
          <text class="auth-card-title"
            >Notification channel (Android only)</text
          >
        </view>
        <view class="button-row">
          <ActionButton
            testID="notifications-channel-set"
            title="Set demo channel"
            :onPress="handleSetChannel"
            :color="lineColor"
          />
          <ActionButton
            testID="notifications-channel-list"
            title="List channels"
            :onPress="handleListChannels"
            :color="lineColor"
          />
        </view>
        <text testID="notifications-channel-status" class="auth-value-text">{{
          channelStatusText
        }}</text>
        <text testID="notifications-channel-list-text" class="info-text">{{
          channelListText
        }}</text>
        <view v-if="channelError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ channelError }}</text>
        </view>
      </view>

      <view testID="notifications-listener-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Listener log</text>
        </view>
        <text class="info-text"
          >Subscribed on mount to received + response events.</text
        >
        <text
          v-for="(entry, index) in eventLog"
          :key="index"
          :testID="`notifications-listener-event-${index}`"
          class="info-text"
          >{{ entry }}</text
        >
        <text
          v-if="eventLog.length === 0"
          testID="notifications-listener-empty"
          class="auth-value-text"
          >No events yet.</text
        >
      </view>
    </scroll-view>
  </safe-area-view>
</template>
