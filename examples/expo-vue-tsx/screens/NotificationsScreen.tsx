import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
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
} from '@symbiote-native/notifications/vue';
import type {
  INotification,
  INotificationPermissionsStatus,
} from '@symbiote-native/notifications/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const SCHEDULE_TRIGGER_SECONDS = 5;
const DEMO_CHANNEL_ID = 'symbiote-demo-channel';
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

type IAsyncResult<T> =
  { kind: 'success'; value: T } | { kind: 'error'; message: string } | null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describePermission(response: INotificationPermissionsStatus): string {
  return `${response.status} · granted: ${response.granted}`;
}

/**
 * Notifications demo: @symbiote-native/notifications — permissions, scheduling, immediate
 * presentation, badges, Android channels, and the received/response listeners.
 */
export const NotificationsScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Notifications];
    const lineColor = LINE_COLOR[lineInfo.line];

    // --- permissions ---
    const permissionStatus = ref('not checked yet');
    async function handleGetPermission() {
      const response = await getPermissionsAsync();
      permissionStatus.value = describePermission(response);
    }
    async function handleRequestPermission() {
      const response = await requestPermissionsAsync();
      permissionStatus.value = describePermission(response);
    }

    // --- scheduling ---
    const scheduleResult: Ref<IAsyncResult<string>> = ref(null);
    const scheduledListResult: Ref<IAsyncResult<string>> = ref(null);
    async function handleSchedule() {
      try {
        const identifier = await scheduleNotificationAsync({
          content: {
            title: 'Symbiote demo',
            body: 'Scheduled from the Notifications screen',
          },
          trigger: {
            type: SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: SCHEDULE_TRIGGER_SECONDS,
          },
        });
        scheduleResult.value = {
          kind: 'success',
          value: `scheduled: ${identifier}`,
        };
      } catch (error) {
        scheduleResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }
    async function handleCancelAllScheduled() {
      try {
        await cancelAllScheduledNotificationsAsync();
        scheduleResult.value = {
          kind: 'success',
          value: 'cancelled all scheduled',
        };
      } catch (error) {
        scheduleResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }
    async function handleListScheduled() {
      try {
        const requests = await getAllScheduledNotificationsAsync();
        scheduledListResult.value = {
          kind: 'success',
          value:
            requests.length === 0
              ? 'no scheduled notifications'
              : requests.map(request => request.identifier).join(', '),
        };
      } catch (error) {
        scheduledListResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
    }

    // --- presentation ---
    const presentResult: Ref<IAsyncResult<string>> = ref(null);
    const presentedListResult: Ref<IAsyncResult<string>> = ref(null);
    async function handlePresentNow() {
      try {
        const identifier = await scheduleNotificationAsync({
          content: { title: 'Symbiote demo', body: 'Presented immediately' },
          trigger: null,
        });
        presentResult.value = {
          kind: 'success',
          value: `presented: ${identifier}`,
        };
      } catch (error) {
        presentResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }
    async function handleDismissAll() {
      try {
        await dismissAllNotificationsAsync();
        presentResult.value = {
          kind: 'success',
          value: 'dismissed all presented',
        };
      } catch (error) {
        presentResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }
    async function handleListPresented() {
      try {
        const notifications = await getPresentedNotificationsAsync();
        presentedListResult.value = {
          kind: 'success',
          value:
            notifications.length === 0
              ? 'no presented notifications'
              : notifications
                  .map(
                    notification =>
                      notification.request.content.title ?? '(no title)',
                  )
                  .join(', '),
        };
      } catch (error) {
        presentedListResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
    }

    // --- badge ---
    const badgeCount = ref(0);
    const badgeResult: Ref<IAsyncResult<string>> = ref(null);
    async function handleGetBadge() {
      try {
        badgeCount.value = await getBadgeCountAsync();
      } catch (error) {
        badgeResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }
    async function handleIncrementBadge() {
      try {
        const next = badgeCount.value + 1;
        await setBadgeCountAsync(next);
        badgeCount.value = next;
      } catch (error) {
        badgeResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }
    async function handleDecrementBadge() {
      try {
        const next = Math.max(0, badgeCount.value - 1);
        await setBadgeCountAsync(next);
        badgeCount.value = next;
      } catch (error) {
        badgeResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }

    // --- channels (Android only) ---
    const channelResult: Ref<IAsyncResult<string>> = ref(null);
    const channelListResult: Ref<IAsyncResult<string>> = ref(null);
    async function handleSetChannel() {
      try {
        await setNotificationChannelAsync(DEMO_CHANNEL_ID, {
          name: 'Symbiote demo channel',
          importance: AndroidImportance.DEFAULT,
        });
        channelResult.value = {
          kind: 'success',
          value: `channel set: ${DEMO_CHANNEL_ID}`,
        };
      } catch (error) {
        channelResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }
    async function handleListChannels() {
      try {
        const channels = await getNotificationChannelsAsync();
        channelListResult.value = {
          kind: 'success',
          value:
            channels.length === 0
              ? 'no channels'
              : channels.map(channel => channel.id).join(', '),
        };
      } catch (error) {
        channelListResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
    }

    // --- listeners ---
    const eventLog: Ref<string[]> = ref([]);
    function logEvent(line: string) {
      eventLog.value = [line, ...eventLog.value].slice(0, MAX_LOGGED_EVENTS);
    }
    function describeReceived(notification: INotification): string {
      return `received: ${notification.request.content.title ?? '(no title)'}`;
    }

    let receivedSubscription: ReturnType<
      typeof addNotificationReceivedListener
    > | null = null;
    let responseSubscription: ReturnType<
      typeof addNotificationResponseReceivedListener
    > | null = null;

    onMounted(() => {
      receivedSubscription = addNotificationReceivedListener(notification => {
        logEvent(describeReceived(notification));
      });
      responseSubscription = addNotificationResponseReceivedListener(
        response => {
          logEvent(`response: ${response.actionIdentifier}`);
        },
      );
    });
    onUnmounted(() => {
      receivedSubscription?.remove();
      responseSubscription?.remove();
    });

    return () => (
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
                presentation, badges, Android channels, and the
                received/response listeners.
              </text>
            </view>
          </view>

          <view testID="notifications-permission-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Permissions</text>
            </view>
            <view class="auth-capability-row">
              <text class="auth-capability-label">Status</text>
              <text
                testID="notifications-permission-status"
                class="auth-value-text"
              >
                {permissionStatus.value}
              </text>
            </view>
            <ActionButton
              testID="notifications-get-permission"
              title="Get permission"
              onPress={handleGetPermission}
              color={lineColor}
            />
            <ActionButton
              testID="notifications-request-permission"
              title="Request permission"
              onPress={handleRequestPermission}
              color={lineColor}
            />
          </view>

          <view testID="notifications-schedule-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Schedule</text>
            </view>
            <ActionButton
              testID="notifications-schedule"
              title={`Schedule in ${SCHEDULE_TRIGGER_SECONDS}s`}
              onPress={handleSchedule}
              color={lineColor}
            />
            <ActionButton
              testID="notifications-cancel-all-scheduled"
              title="Cancel all scheduled"
              onPress={handleCancelAllScheduled}
              color={lineColor}
            />
            <ActionButton
              testID="notifications-list-scheduled"
              title="List scheduled"
              onPress={handleListScheduled}
              color={lineColor}
            />
            {scheduleResult.value && (
              <view
                testID="notifications-schedule-result"
                class={`auth-result auth-result-${scheduleResult.value.kind === 'error' ? 'error' : 'success'}`}
              >
                <text class="auth-result-text">
                  {scheduleResult.value.kind === 'error'
                    ? `Failed: ${scheduleResult.value.message}`
                    : scheduleResult.value.value}
                </text>
              </view>
            )}
            {scheduledListResult.value && (
              <text testID="notifications-scheduled-list" class="info-text">
                {scheduledListResult.value.kind === 'error'
                  ? `Failed: ${scheduledListResult.value.message}`
                  : scheduledListResult.value.value}
              </text>
            )}
          </view>

          <view testID="notifications-present-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Present</text>
            </view>
            <ActionButton
              testID="notifications-present-now"
              title="Present immediately"
              onPress={handlePresentNow}
              color={lineColor}
            />
            <ActionButton
              testID="notifications-dismiss-all"
              title="Dismiss all presented"
              onPress={handleDismissAll}
              color={lineColor}
            />
            <ActionButton
              testID="notifications-list-presented"
              title="List presented"
              onPress={handleListPresented}
              color={lineColor}
            />
            {presentResult.value && (
              <view
                testID="notifications-present-result"
                class={`auth-result auth-result-${presentResult.value.kind === 'error' ? 'error' : 'success'}`}
              >
                <text class="auth-result-text">
                  {presentResult.value.kind === 'error'
                    ? `Failed: ${presentResult.value.message}`
                    : presentResult.value.value}
                </text>
              </view>
            )}
            {presentedListResult.value && (
              <text testID="notifications-presented-list" class="info-text">
                {presentedListResult.value.kind === 'error'
                  ? `Failed: ${presentedListResult.value.message}`
                  : presentedListResult.value.value}
              </text>
            )}
          </view>

          <view testID="notifications-badge-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Badge</text>
            </view>
            <view class="auth-capability-row">
              <text class="auth-capability-label">Count</text>
              <text testID="notifications-badge-count" class="auth-value-text">
                {String(badgeCount.value)}
              </text>
            </view>
            <ActionButton
              testID="notifications-badge-get"
              title="Get badge count"
              onPress={handleGetBadge}
              color={lineColor}
            />
            <ActionButton
              testID="notifications-badge-increment"
              title="+1"
              onPress={handleIncrementBadge}
              color={lineColor}
            />
            <ActionButton
              testID="notifications-badge-decrement"
              title="-1"
              onPress={handleDecrementBadge}
              color={lineColor}
            />
            {badgeResult.value && badgeResult.value.kind === 'error' && (
              <view
                testID="notifications-badge-result"
                class="auth-result auth-result-error"
              >
                <text class="auth-result-text">{`Failed: ${badgeResult.value.message}`}</text>
              </view>
            )}
          </view>

          {Platform.OS === 'android' && (
            <view testID="notifications-channel-card" class="auth-card">
              <view class="auth-card-header">
                <text class="auth-card-title">Channels</text>
              </view>
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
              {channelResult.value && (
                <view
                  testID="notifications-channel-result"
                  class={`auth-result auth-result-${channelResult.value.kind === 'error' ? 'error' : 'success'}`}
                >
                  <text class="auth-result-text">
                    {channelResult.value.kind === 'error'
                      ? `Failed: ${channelResult.value.message}`
                      : channelResult.value.value}
                  </text>
                </view>
              )}
              {channelListResult.value && (
                <text
                  testID="notifications-channel-list-result"
                  class="info-text"
                >
                  {channelListResult.value.kind === 'error'
                    ? `Failed: ${channelListResult.value.message}`
                    : channelListResult.value.value}
                </text>
              )}
            </view>
          )}

          <view testID="notifications-listener-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Listeners</text>
            </view>
            <text testID="notifications-event-count" class="auth-value-text">
              {`${eventLog.value.length} event${eventLog.value.length === 1 ? '' : 's'}`}
            </text>
            {eventLog.value.length === 0 ? (
              <text class="info-text">no events yet</text>
            ) : (
              eventLog.value.map(line => <text class="info-text">{line}</text>)
            )}
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'NotificationsScreen' },
);
