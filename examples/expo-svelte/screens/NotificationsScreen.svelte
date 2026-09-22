<script lang="ts">
  // @symbiote-native/notifications tour stop — permissions, scheduling (a short time-interval
  // trigger, `trigger: null` presents immediately), presentation, badges, Android channels, and
  // the received/response listeners. Every export here is a plain async function or a listener
  // registration, no hook/composable wrapper. Svelte twin of
  // examples/expo-vue-sfc/screens/NotificationsScreen.vue.
  import { Platform } from '@symbiote-native/svelte';
  import {
    AndroidImportance,
    SchedulableTriggerInputTypes,
    addNotificationReceivedListener,
    addNotificationResponseReceivedListener,
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
  } from '@symbiote-native/notifications';
  import type {
    INotification,
    INotificationChannel,
    INotificationRequest,
  } from '@symbiote-native/notifications';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const DEMO_CHANNEL_ID = 'symbiote-demo-channel';
  const SCHEDULE_DELAY_SECONDS = 5;

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

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  function toCapabilityStatus(value: boolean): ICapabilityStatus {
    return value ? 'yes' : 'no';
  }

  function capabilityStatusText(status: ICapabilityStatus): string {
    if (status === 'checking') return 'CHECKING…';
    return status === 'yes' ? 'YES' : 'NO';
  }

  // Permissions
  let permissionStatus = $state<ICapabilityStatus>('checking');
  let permissionError = $state<string | null>(null);

  async function handleGetPermission(): Promise<void> {
    permissionError = null;
    try {
      const response = await getPermissionsAsync();
      permissionStatus = toCapabilityStatus(response.granted);
    } catch (reason) {
      permissionError = String(reason);
    }
  }

  async function handleRequestPermission(): Promise<void> {
    permissionError = null;
    try {
      const response = await requestPermissionsAsync();
      permissionStatus = toCapabilityStatus(response.granted);
    } catch (reason) {
      permissionError = String(reason);
    }
  }

  // Scheduling
  let scheduledIdentifier = $state<string | null>(null);
  let scheduleError = $state<string | null>(null);
  let scheduledNotifications = $state<INotificationRequest[]>([]);
  let listScheduledError = $state<string | null>(null);

  async function handleScheduleNotification(): Promise<void> {
    scheduleError = null;
    try {
      scheduledIdentifier = await scheduleNotificationAsync({
        content: {
          title: "Time's up!",
          body: `Fired ${SCHEDULE_DELAY_SECONDS}s after tap.`,
        },
        trigger: {
          type: SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: SCHEDULE_DELAY_SECONDS,
        },
      });
    } catch (reason) {
      scheduleError = String(reason);
    }
  }

  async function handleCancelAllScheduled(): Promise<void> {
    scheduleError = null;
    try {
      await cancelAllScheduledNotificationsAsync();
      scheduledIdentifier = null;
    } catch (reason) {
      scheduleError = String(reason);
    }
  }

  async function handleListScheduled(): Promise<void> {
    listScheduledError = null;
    try {
      scheduledNotifications = await getAllScheduledNotificationsAsync();
    } catch (reason) {
      listScheduledError = String(reason);
    }
  }

  const scheduledListText = $derived(
    scheduledNotifications
      .map(request => request.content.title ?? '(untitled)')
      .join(', ') || '(none loaded)',
  );

  // Presentation
  let presentDone = $state(false);
  let presentError = $state<string | null>(null);
  let presentedNotifications = $state<INotification[]>([]);
  let listPresentedError = $state<string | null>(null);

  async function handlePresentNow(): Promise<void> {
    presentError = null;
    try {
      await scheduleNotificationAsync({
        content: {
          title: 'Presented now',
          body: 'trigger: null fires immediately.',
        },
        trigger: null,
      });
      presentDone = true;
    } catch (reason) {
      presentError = String(reason);
    }
  }

  async function handleDismissAllPresented(): Promise<void> {
    presentError = null;
    try {
      await dismissAllNotificationsAsync();
    } catch (reason) {
      presentError = String(reason);
    }
  }

  async function handleListPresented(): Promise<void> {
    listPresentedError = null;
    try {
      presentedNotifications = await getPresentedNotificationsAsync();
    } catch (reason) {
      listPresentedError = String(reason);
    }
  }

  const presentedListText = $derived(
    presentedNotifications
      .map(notification => notification.request.content.title ?? '(untitled)')
      .join(', ') || '(none loaded)',
  );

  // Badge
  let badgeCount = $state<number | null>(null);
  let badgeError = $state<string | null>(null);

  async function handleGetBadge(): Promise<void> {
    badgeError = null;
    try {
      badgeCount = await getBadgeCountAsync();
    } catch (reason) {
      badgeError = String(reason);
    }
  }

  async function handleIncrementBadge(): Promise<void> {
    badgeError = null;
    try {
      const next = (badgeCount ?? 0) + 1;
      await setBadgeCountAsync(next);
      badgeCount = next;
    } catch (reason) {
      badgeError = String(reason);
    }
  }

  async function handleDecrementBadge(): Promise<void> {
    badgeError = null;
    try {
      const next = Math.max(0, (badgeCount ?? 0) - 1);
      await setBadgeCountAsync(next);
      badgeCount = next;
    } catch (reason) {
      badgeError = String(reason);
    }
  }

  const badgeCountText = $derived(
    badgeCount === null ? 'not checked yet' : String(badgeCount),
  );

  // Channels — @platform android
  let channels = $state<INotificationChannel[]>([]);
  let channelError = $state<string | null>(null);
  let channelSetDone = $state(false);

  async function handleSetChannel(): Promise<void> {
    channelError = null;
    try {
      await setNotificationChannelAsync(DEMO_CHANNEL_ID, {
        name: 'Symbiote demo channel',
        importance: AndroidImportance.DEFAULT,
      });
      channelSetDone = true;
    } catch (reason) {
      channelError = String(reason);
    }
  }

  async function handleListChannels(): Promise<void> {
    channelError = null;
    try {
      channels = await getNotificationChannelsAsync();
    } catch (reason) {
      channelError = String(reason);
    }
  }

  const channelListText = $derived(
    channels.map(channel => channel.id).join(', ') || '(none loaded)',
  );

  // Listeners
  type IEventLogEntry = { id: number; label: string };

  let eventLog = $state<IEventLogEntry[]>([]);
  let eventLogSeq = 0;

  function pushLogEntry(label: string): void {
    eventLogSeq += 1;
    eventLog = [{ id: eventLogSeq, label }, ...eventLog].slice(0, 5);
  }

  $effect(() => {
    const receivedSubscription = addNotificationReceivedListener(
      notification => {
        pushLogEntry(
          `received: ${notification.request.content.title ?? '(untitled)'}`,
        );
      },
    );
    const responseSubscription = addNotificationResponseReceivedListener(
      response => {
        pushLogEntry(
          `response: ${response.notification.request.content.title ?? '(untitled)'}`,
        );
      },
    );
    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  });

  const eventLogText = $derived(
    eventLog.length
      ? eventLog.map(entry => entry.label).join('\n')
      : 'none yet',
  );
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="notifications-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Notifications</text>
        <text testID="notifications-hero" class="hero-body">
          @symbiote-native/notifications — permissions, scheduling,
          presentation, badges, Android channels, and the received/response
          listeners over expo-notifications.
        </text>
      </view>
    </view>

    <view testID="notifications-permission-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Permissions</text>
        <view class={`auth-status-badge auth-status-badge-${permissionStatus}`}>
          <text class="auth-status-text">
            {capabilityStatusText(permissionStatus)}
          </text>
        </view>
      </view>
      <view class="button-row">
        <ActionButton
          testID="notifications-permission-get"
          title="Get permission"
          onPress={handleGetPermission}
          color={lineColor}
        />
        <ActionButton
          testID="notifications-permission-request"
          title="Request permission"
          onPress={handleRequestPermission}
          color={lineColor}
        />
      </view>{#if permissionError}<text class="auth-result-text">
          {permissionError}
        </text>{/if}
    </view>

    <view testID="notifications-schedule-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Schedule</text>
      </view>
      <view class="button-row">
        <ActionButton
          testID="notifications-schedule"
          title={`Schedule in ${SCHEDULE_DELAY_SECONDS}s`}
          onPress={handleScheduleNotification}
          color={lineColor}
        />
        <ActionButton
          testID="notifications-schedule-cancel-all"
          title="Cancel all"
          onPress={handleCancelAllScheduled}
          color={lineColor}
        />
        <ActionButton
          testID="notifications-schedule-list"
          title="List scheduled"
          onPress={handleListScheduled}
          color={lineColor}
        />
      </view>{#if scheduleError}<text class="auth-result-text">
          {scheduleError}
        </text>{:else if scheduledIdentifier}<text
          testID="notifications-schedule-result"
          class="auth-value-text"
        >
          {scheduledIdentifier}
        </text>{/if}{#if listScheduledError}<text class="auth-result-text">
          {listScheduledError}
        </text>{:else}<text
          testID="notifications-schedule-list-result"
          class="info-text"
        >
          {scheduledListText}
        </text>{/if}
    </view>

    <view testID="notifications-present-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Present</text>
      </view>
      <view class="button-row">
        <ActionButton
          testID="notifications-present-now"
          title="Present now"
          onPress={handlePresentNow}
          color={lineColor}
        />
        <ActionButton
          testID="notifications-present-dismiss-all"
          title="Dismiss all"
          onPress={handleDismissAllPresented}
          color={lineColor}
        />
        <ActionButton
          testID="notifications-present-list"
          title="List presented"
          onPress={handleListPresented}
          color={lineColor}
        />
      </view>{#if presentError}<text class="auth-result-text">
          {presentError}
        </text>{:else if presentDone}<text
          testID="notifications-present-result"
          class="auth-value-text"
        >
          presented
        </text>{/if}{#if listPresentedError}<text class="auth-result-text">
          {listPresentedError}
        </text>{:else}<text
          testID="notifications-present-list-result"
          class="info-text"
        >
          {presentedListText}
        </text>{/if}
    </view>

    <view testID="notifications-badge-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Badge</text>
      </view>
      <view class="button-row">
        <ActionButton
          testID="notifications-badge-get"
          title="Get"
          onPress={handleGetBadge}
          color={lineColor}
        />
        <ActionButton
          testID="notifications-badge-decrement"
          title="−1"
          onPress={handleDecrementBadge}
          color={lineColor}
        />
        <ActionButton
          testID="notifications-badge-increment"
          title="+1"
          onPress={handleIncrementBadge}
          color={lineColor}
        />
      </view>{#if badgeError}<text class="auth-result-text">
          {badgeError}
        </text>{:else}<text
          testID="notifications-badge-count"
          class="auth-value-text"
        >
          {badgeCountText}
        </text>{/if}
    </view>

    {#if Platform.OS === 'android'}<view
        testID="notifications-channel-card"
        class="auth-card"
      >
        <view class="auth-card-header">
          <text class="auth-card-title">Channels</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="notifications-channel-set"
            title="Set demo channel"
            onPress={handleSetChannel}
            color={lineColor}
          />
          <ActionButton
            testID="notifications-channel-list"
            title="List channels"
            onPress={handleListChannels}
            color={lineColor}
          />
        </view>{#if channelError}<text class="auth-result-text">
            {channelError}
          </text>{:else if channelSetDone}<text
            testID="notifications-channel-result"
            class="auth-value-text"
          >
            set
          </text>{/if}<text
          testID="notifications-channel-list-result"
          class="info-text"
        >
          {channelListText}
        </text>
      </view>{/if}

    <view testID="notifications-listener-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Received / response listeners</text>
      </view>
      <text testID="notifications-listener-log" class="info-text">
        {eventLogText}
      </text>
    </view>
  </scroll-view>
</safe-area-view>
