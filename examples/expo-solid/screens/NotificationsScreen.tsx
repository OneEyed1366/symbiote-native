import { createSignal, onCleanup } from 'solid-js';
import { Platform } from '@symbiote-native/solid';
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
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const SCHEDULE_DELAY_SECONDS = 5;
const DEMO_CHANNEL_ID = 'canary-demo-channel';
const MAX_LOG_EVENTS = 5;

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @symbiote-native/notifications canary demo: permissions, a short time-interval schedule +
 * cancel-all + list, immediate presentation (scheduleNotificationAsync with `trigger: null` —
 * this port has no separate presentNotificationAsync, see the package README) + dismiss-all +
 * list-presented, the badge count, an Android notification channel, and the received/response
 * listeners.
 */
export function NotificationsScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Notifications];
  const lineColor = LINE_COLOR[lineInfo.line];

  // --- Permissions ---
  const [permissionStatus, setPermissionStatus] = createSignal<string | null>(
    null,
  );
  const [permissionError, setPermissionError] = createSignal<string | null>(
    null,
  );
  const permissionDisplay = () =>
    permissionError() ?? permissionStatus() ?? 'not checked yet';

  const handleGetPermission = async () => {
    try {
      const result = await getPermissionsAsync();
      setPermissionError(null);
      setPermissionStatus(`${result.status} · granted=${result.granted}`);
    } catch (error) {
      setPermissionError(errorMessage(error));
    }
  };
  const handleRequestPermission = async () => {
    try {
      const result = await requestPermissionsAsync();
      setPermissionError(null);
      setPermissionStatus(`${result.status} · granted=${result.granted}`);
    } catch (error) {
      setPermissionError(errorMessage(error));
    }
  };

  // --- Schedule ---
  const [scheduleStatus, setScheduleStatus] = createSignal<string | null>(null);
  const [scheduleError, setScheduleError] = createSignal<string | null>(null);
  const [scheduledCount, setScheduledCount] = createSignal<number | null>(null);
  const scheduleStatusDisplay = () =>
    scheduleError() ?? scheduleStatus() ?? 'not scheduled yet';
  const scheduledCountDisplay = () =>
    scheduledCount() === null
      ? 'not loaded yet'
      : `${scheduledCount()} scheduled`;

  const handleSchedule = async () => {
    try {
      const identifier = await scheduleNotificationAsync({
        content: {
          title: 'Canary demo',
          body: `Fires ${SCHEDULE_DELAY_SECONDS}s after scheduling`,
        },
        trigger: {
          type: SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: SCHEDULE_DELAY_SECONDS,
        },
      });
      setScheduleError(null);
      setScheduleStatus(`scheduled: ${identifier}`);
    } catch (error) {
      setScheduleError(errorMessage(error));
    }
  };
  const handleCancelAllScheduled = async () => {
    try {
      await cancelAllScheduledNotificationsAsync();
      setScheduleError(null);
      setScheduleStatus('cancelled all scheduled notifications');
    } catch (error) {
      setScheduleError(errorMessage(error));
    }
  };
  const handleListScheduled = async () => {
    try {
      const requests = await getAllScheduledNotificationsAsync();
      setScheduleError(null);
      setScheduledCount(requests.length);
    } catch (error) {
      setScheduledCount(null);
      setScheduleError(errorMessage(error));
    }
  };

  // --- Present ---
  const [presentStatus, setPresentStatus] = createSignal<string | null>(null);
  const [presentError, setPresentError] = createSignal<string | null>(null);
  const [presentedCount, setPresentedCount] = createSignal<number | null>(null);
  const presentStatusDisplay = () =>
    presentError() ?? presentStatus() ?? 'not presented yet';
  const presentedCountDisplay = () =>
    presentedCount() === null
      ? 'not loaded yet'
      : `${presentedCount()} presented`;

  const handlePresentNow = async () => {
    try {
      const identifier = await scheduleNotificationAsync({
        content: { title: 'Canary demo', body: 'Presented immediately' },
        trigger: null,
      });
      setPresentError(null);
      setPresentStatus(`presented: ${identifier}`);
    } catch (error) {
      setPresentError(errorMessage(error));
    }
  };
  const handleDismissAll = async () => {
    try {
      await dismissAllNotificationsAsync();
      setPresentError(null);
      setPresentStatus('dismissed all presented notifications');
    } catch (error) {
      setPresentError(errorMessage(error));
    }
  };
  const handleListPresented = async () => {
    try {
      const notifications = await getPresentedNotificationsAsync();
      setPresentError(null);
      setPresentedCount(notifications.length);
    } catch (error) {
      setPresentedCount(null);
      setPresentError(errorMessage(error));
    }
  };

  // --- Badge ---
  const [badgeCount, setBadgeCountSignal] = createSignal<number | null>(null);
  const [badgeError, setBadgeError] = createSignal<string | null>(null);
  const badgeDisplay = () =>
    badgeError() ??
    (badgeCount() === null ? 'not loaded yet' : `${badgeCount()}`);

  const handleGetBadge = async () => {
    try {
      const count = await getBadgeCountAsync();
      setBadgeError(null);
      setBadgeCountSignal(count);
    } catch (error) {
      setBadgeError(errorMessage(error));
    }
  };
  const handleBumpBadge = async (delta: number) => {
    try {
      const next = Math.max(0, (badgeCount() ?? 0) + delta);
      await setBadgeCountAsync(next);
      setBadgeError(null);
      setBadgeCountSignal(next);
    } catch (error) {
      setBadgeError(errorMessage(error));
    }
  };

  // --- Android channel ---
  const [channelStatus, setChannelStatus] = createSignal<string | null>(null);
  const [channelError, setChannelError] = createSignal<string | null>(null);
  const channelStatusDisplay = () =>
    channelError() ?? channelStatus() ?? 'not set yet';

  const handleSetChannel = async () => {
    try {
      const channel = await setNotificationChannelAsync(DEMO_CHANNEL_ID, {
        name: 'Canary demo channel',
        importance: AndroidImportance.DEFAULT,
      });
      setChannelError(null);
      setChannelStatus(
        channel === null ? 'null' : `set: ${channel.id} (${channel.name})`,
      );
    } catch (error) {
      setChannelError(errorMessage(error));
    }
  };
  const handleListChannels = async () => {
    try {
      const channels = await getNotificationChannelsAsync();
      setChannelError(null);
      setChannelStatus(`${channels.length} channel(s)`);
    } catch (error) {
      setChannelError(errorMessage(error));
    }
  };

  // --- Listeners ---
  const [eventLog, setEventLog] = createSignal<string[]>([]);
  const pushEvent = (entry: string) => {
    setEventLog(previous => [entry, ...previous].slice(0, MAX_LOG_EVENTS));
  };
  const receivedSubscription = addNotificationReceivedListener(notification => {
    pushEvent(
      `received: ${notification.request.content.title ?? '(no title)'}`,
    );
  });
  const responseSubscription = addNotificationResponseReceivedListener(
    response => {
      pushEvent(`response: ${response.actionIdentifier}`);
    },
  );
  onCleanup(() => {
    receivedSubscription.remove();
    responseSubscription.remove();
  });
  const eventLogDisplay = () =>
    eventLog().length === 0 ? 'no events yet' : eventLog().join(' · ');

  return (
    <safe-area-view class="screen">
      <scroll-view
        testID="notifications-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view testID="notifications-hero" class="hero-card">
          <view class="hero-badge" style={{ backgroundColor: lineColor }}>
            <text class="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Notifications</text>
            <text class="hero-body">
              @symbiote-native/notifications — permissions, scheduling,
              immediate presentation, badges, Android channels, and the
              received/response listeners.
            </text>
          </view>
        </view>

        <view testID="notifications-permission-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Permissions</text>
          </view>
          <ActionButton
            testID="notifications-get-permission"
            title="Get permission"
            onPress={() => void handleGetPermission()}
            color={lineColor}
          />
          <ActionButton
            testID="notifications-request-permission"
            title="Request permission"
            onPress={() => void handleRequestPermission()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="notifications-permission-status" class="value-text">
              {permissionDisplay()}
            </text>
          </view>
        </view>

        <view testID="notifications-schedule-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Schedule</text>
          </view>
          <ActionButton
            testID="notifications-schedule"
            title={`Schedule (+${SCHEDULE_DELAY_SECONDS}s)`}
            onPress={() => void handleSchedule()}
            color={lineColor}
          />
          <ActionButton
            testID="notifications-cancel-all-scheduled"
            title="Cancel all scheduled"
            onPress={() => void handleCancelAllScheduled()}
            color={lineColor}
          />
          <ActionButton
            testID="notifications-list-scheduled"
            title="List scheduled"
            onPress={() => void handleListScheduled()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="notifications-schedule-status" class="value-text">
              {scheduleStatusDisplay()}
            </text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Scheduled</text>
            <text testID="notifications-scheduled-count" class="value-text">
              {scheduledCountDisplay()}
            </text>
          </view>
        </view>

        <view testID="notifications-present-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Present</text>
          </view>
          <ActionButton
            testID="notifications-present-now"
            title="Present now"
            onPress={() => void handlePresentNow()}
            color={lineColor}
          />
          <ActionButton
            testID="notifications-dismiss-all"
            title="Dismiss all"
            onPress={() => void handleDismissAll()}
            color={lineColor}
          />
          <ActionButton
            testID="notifications-list-presented"
            title="List presented"
            onPress={() => void handleListPresented()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="notifications-present-status" class="value-text">
              {presentStatusDisplay()}
            </text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Presented</text>
            <text testID="notifications-presented-count" class="value-text">
              {presentedCountDisplay()}
            </text>
          </view>
        </view>

        <view testID="notifications-badge-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Badge count</text>
          </view>
          <ActionButton
            testID="notifications-badge-get"
            title="Get badge"
            onPress={() => void handleGetBadge()}
            color={lineColor}
          />
          <ActionButton
            testID="notifications-badge-increment"
            title="+1"
            onPress={() => void handleBumpBadge(1)}
            color={lineColor}
          />
          <ActionButton
            testID="notifications-badge-decrement"
            title="-1"
            onPress={() => void handleBumpBadge(-1)}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Count</text>
            <text testID="notifications-badge-count" class="value-text">
              {badgeDisplay()}
            </text>
          </view>
        </view>

        {Platform.OS === 'android' && (
          <view testID="notifications-channel-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Channel (Android)</text>
            </view>
            <ActionButton
              testID="notifications-set-channel"
              title="Set channel"
              onPress={() => void handleSetChannel()}
              color={lineColor}
            />
            <ActionButton
              testID="notifications-list-channels"
              title="List channels"
              onPress={() => void handleListChannels()}
              color={lineColor}
            />
            <view class="capability-row">
              <text class="capability-label">Status</text>
              <text testID="notifications-channel-status" class="value-text">
                {channelStatusDisplay()}
              </text>
            </view>
          </view>
        )}

        <view testID="notifications-listener-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">
              Received / response listeners
            </text>
          </view>
          <text testID="notifications-event-log" class="info-text">
            {eventLogDisplay()}
          </text>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
