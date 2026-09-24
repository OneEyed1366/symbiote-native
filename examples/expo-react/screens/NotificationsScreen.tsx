import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from '@symbiote-native/react';
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
const DEMO_CHANNEL_ID = 'symbiote-canary-demo-channel';
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type IAsyncResult<TValue> =
  { status: 'success'; value: TValue } | { status: 'error'; message: string };

function ResultBlock({
  testID,
  result,
}: {
  testID: string;
  result: IAsyncResult<string> | null;
}) {
  if (!result) {
    return null;
  }
  return (
    <view
      testID={testID}
      className={`auth-result auth-result-${result.status === 'success' ? 'success' : 'error'}`}
    >
      <text className="auth-result-text">
        {result.status === 'success'
          ? result.value
          : `Failed: ${result.message}`}
      </text>
    </view>
  );
}

/**
 * @symbiote-native/notifications canary demo: permissions, local scheduling (a short
 * time-interval trigger), immediate presentation, badge count, Android notification channels,
 * and the received/response event listeners. Never touches push tokens or remote delivery — see
 * the package README's "Required one-time steps this linker does NOT cover" for what real push
 * needs beyond this demo.
 */
export function NotificationsScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Notifications];
  const lineColor = LINE_COLOR[lineInfo.line];

  // --- permissions ---
  const [permissionResult, setPermissionResult] =
    useState<IAsyncResult<string> | null>(null);

  const handleGetPermission = useCallback(() => {
    getPermissionsAsync()
      .then(response =>
        setPermissionResult({ status: 'success', value: response.status }),
      )
      .catch(error =>
        setPermissionResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  const handleRequestPermission = useCallback(() => {
    requestPermissionsAsync()
      .then(response =>
        setPermissionResult({ status: 'success', value: response.status }),
      )
      .catch(error =>
        setPermissionResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  // --- scheduling ---
  const [scheduleResult, setScheduleResult] =
    useState<IAsyncResult<string> | null>(null);

  const handleSchedule = useCallback(() => {
    scheduleNotificationAsync({
      content: {
        title: 'Canary reminder',
        body: `Fired ${SCHEDULE_DELAY_SECONDS}s after scheduling`,
      },
      trigger: {
        type: SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: SCHEDULE_DELAY_SECONDS,
      },
    })
      .then(identifier =>
        setScheduleResult({
          status: 'success',
          value: `Scheduled ${identifier}`,
        }),
      )
      .catch(error =>
        setScheduleResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  const handleCancelAllScheduled = useCallback(() => {
    cancelAllScheduledNotificationsAsync()
      .then(() =>
        setScheduleResult({
          status: 'success',
          value: 'Cancelled all scheduled',
        }),
      )
      .catch(error =>
        setScheduleResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  const handleListScheduled = useCallback(() => {
    getAllScheduledNotificationsAsync()
      .then(requests =>
        setScheduleResult({
          status: 'success',
          value: `${requests.length} scheduled`,
        }),
      )
      .catch(error =>
        setScheduleResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  // --- presentation ---
  const [presentResult, setPresentResult] =
    useState<IAsyncResult<string> | null>(null);

  const handlePresentNow = useCallback(() => {
    scheduleNotificationAsync({
      content: { title: 'Canary — present now', body: 'Presented immediately' },
      trigger: null,
    })
      .then(identifier =>
        setPresentResult({
          status: 'success',
          value: `Presented ${identifier}`,
        }),
      )
      .catch(error =>
        setPresentResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  const handleDismissAll = useCallback(() => {
    dismissAllNotificationsAsync()
      .then(() =>
        setPresentResult({ status: 'success', value: 'Dismissed all' }),
      )
      .catch(error =>
        setPresentResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  const handleListPresented = useCallback(() => {
    getPresentedNotificationsAsync()
      .then(notifications =>
        setPresentResult({
          status: 'success',
          value: `${notifications.length} presented`,
        }),
      )
      .catch(error =>
        setPresentResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  // --- badge ---
  const [badgeCount, setBadgeCount] = useState<number | null>(null);
  const [badgeResult, setBadgeResult] = useState<IAsyncResult<string> | null>(
    null,
  );

  useEffect(() => {
    let isMounted = true;
    getBadgeCountAsync().then(count => {
      if (isMounted) {
        setBadgeCount(count);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAdjustBadge = useCallback(
    (delta: number) => {
      const nextCount = Math.max(0, (badgeCount ?? 0) + delta);
      setBadgeCountAsync(nextCount)
        .then(() => {
          setBadgeCount(nextCount);
          setBadgeResult({
            status: 'success',
            value: `Badge set to ${nextCount}`,
          });
        })
        .catch(error =>
          setBadgeResult({ status: 'error', message: errorMessage(error) }),
        );
    },
    [badgeCount],
  );

  // --- Android channels ---
  const [channelResult, setChannelResult] =
    useState<IAsyncResult<string> | null>(null);

  const handleSetChannel = useCallback(() => {
    setNotificationChannelAsync(DEMO_CHANNEL_ID, {
      name: 'Canary demo channel',
      importance: AndroidImportance.DEFAULT,
    })
      .then(channel =>
        setChannelResult({
          status: 'success',
          value: channel
            ? `${channel.id} · importance ${channel.importance}`
            : 'no channel returned',
        }),
      )
      .catch(error =>
        setChannelResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  const handleListChannels = useCallback(() => {
    getNotificationChannelsAsync()
      .then(channels =>
        setChannelResult({
          status: 'success',
          value: `${channels.length} channels`,
        }),
      )
      .catch(error =>
        setChannelResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  // --- listeners ---
  const [events, setEvents] = useState<string[]>([]);
  const receivedSubscriptionRef = useRef<ReturnType<
    typeof addNotificationReceivedListener
  > | null>(null);
  const responseSubscriptionRef = useRef<ReturnType<
    typeof addNotificationResponseReceivedListener
  > | null>(null);

  useEffect(() => {
    receivedSubscriptionRef.current = addNotificationReceivedListener(
      notification => {
        const title = notification.request.content.title ?? '—';
        setEvents(previous =>
          [`received: ${title}`, ...previous].slice(0, MAX_LOGGED_EVENTS),
        );
      },
    );
    responseSubscriptionRef.current = addNotificationResponseReceivedListener(
      response => {
        setEvents(previous =>
          [`response: ${response.actionIdentifier}`, ...previous].slice(
            0,
            MAX_LOGGED_EVENTS,
          ),
        );
      },
    );
    return () => {
      receivedSubscriptionRef.current?.remove();
      responseSubscriptionRef.current?.remove();
    };
  }, []);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="notifications-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view testID="notifications-hero" className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Notifications</text>
            <text className="hero-body">
              @symbiote-native/notifications — permissions, local scheduling,
              immediate presentation, badge count, Android channels, and the
              received/response event listeners. No push tokens here.
            </text>
          </view>
        </view>

        <view testID="notifications-permission-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Permissions</text>
          </view>
          <view className="button-row">
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
          <ResultBlock
            testID="notifications-permission-status"
            result={permissionResult}
          />
        </view>

        <view testID="notifications-schedule-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Scheduling</text>
          </view>
          <text className="info-text">{`Fires ${SCHEDULE_DELAY_SECONDS}s after scheduling`}</text>
          <view className="button-row">
            <ActionButton
              testID="notifications-schedule"
              title="Schedule"
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
          </view>
          <ResultBlock
            testID="notifications-schedule-result"
            result={scheduleResult}
          />
        </view>

        <view testID="notifications-present-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Presentation</text>
          </view>
          <view className="button-row">
            <ActionButton
              testID="notifications-present-now"
              title="Present now"
              onPress={handlePresentNow}
              color={lineColor}
            />
            <ActionButton
              testID="notifications-dismiss-all"
              title="Dismiss all"
              onPress={handleDismissAll}
              color={lineColor}
            />
            <ActionButton
              testID="notifications-list-presented"
              title="List presented"
              onPress={handleListPresented}
              color={lineColor}
            />
          </view>
          <ResultBlock
            testID="notifications-present-result"
            result={presentResult}
          />
        </view>

        <view testID="notifications-badge-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Badge</text>
          </view>
          <text testID="notifications-badge-count" className="auth-value-text">
            {badgeCount === null ? 'Not loaded yet' : `${badgeCount}`}
          </text>
          <view className="button-row">
            <ActionButton
              testID="notifications-badge-decrement"
              title="-1"
              onPress={() => handleAdjustBadge(-1)}
              color={lineColor}
            />
            <ActionButton
              testID="notifications-badge-increment"
              title="+1"
              onPress={() => handleAdjustBadge(1)}
              color={lineColor}
            />
          </view>
          <ResultBlock
            testID="notifications-badge-result"
            result={badgeResult}
          />
        </view>

        {Platform.OS === 'android' && (
          <view testID="notifications-channel-card" className="auth-card">
            <view className="auth-card-header">
              <text className="auth-card-title">Channels (Android only)</text>
            </view>
            <view className="button-row">
              <ActionButton
                testID="notifications-set-channel"
                title="Set demo channel"
                onPress={handleSetChannel}
                color={lineColor}
              />
              <ActionButton
                testID="notifications-list-channels"
                title="List channels"
                onPress={handleListChannels}
                color={lineColor}
              />
            </view>
            <ResultBlock
              testID="notifications-channel-result"
              result={channelResult}
            />
          </view>
        )}

        <view testID="notifications-listener-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Event log</text>
          </view>
          <text testID="notifications-event-count" className="auth-value-text">
            {`${events.length} event${events.length === 1 ? '' : 's'} logged`}
          </text>
          <text testID="notifications-event-log" className="info-text">
            {events.length === 0 ? 'none yet' : events.join('\n')}
          </text>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
