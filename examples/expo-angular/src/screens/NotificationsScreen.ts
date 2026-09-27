import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  AndroidImportance,
  DEFAULT_ACTION_IDENTIFIER,
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
  INotificationPermissionsStatus,
  INotificationRequest,
} from '@symbiote-native/notifications';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const SCHEDULE_DELAY_SECONDS = 5;
const DEMO_CHANNEL_ID = 'symbiote-demo-channel';
const MAX_LISTENER_EVENTS = 5;

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

/**
 * @symbiote-native/notifications canary demo: permissions, scheduling (a time-interval trigger a
 * few seconds out, plus present-immediately via `trigger: null`), presentation, badges, an
 * Android-only channel card, and a live received/response listener log. Every export is a plain
 * async function or listener registration — no Angular service wrapper exists for this package,
 * same imperative shape as FileSystemScreen/MediaLibraryScreen.
 */
@Component({
  selector: 'NotificationsScreen',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="notifications-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">{{ heroBadgeCode }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Notifications</text>
            <text testID="notifications-hero" class="hero-body">
              @symbiote-native/notifications — permissions, scheduling,
              presentation, badges, Android channels, and live listeners.
            </text>
          </view>
        </view>

        <view testID="notifications-permission-card" class="capability-card">
          <text class="capability-card-title">Permissions</text>
          <view class="button-row">
            <ActionButton
              testID="notifications-request-permission"
              title="Request permission"
              (press)="requestPermission()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="notifications-get-permission"
              title="Get permission"
              (press)="getPermission()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="notifications-permission-status" class="value-text">{{
            permissionStatusLabel()
          }}</text>
        </view>

        <view testID="notifications-schedule-card" class="capability-card">
          <text class="capability-card-title">Schedule</text>
          <view class="button-row">
            <ActionButton
              testID="notifications-schedule"
              title="Schedule in 5s"
              (press)="scheduleDemo()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="notifications-cancel-all-scheduled"
              title="Cancel all scheduled"
              (press)="cancelAllScheduled()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="notifications-list-scheduled"
              title="List scheduled"
              (press)="listScheduled()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="notifications-schedule-status" class="value-text">{{
            scheduleStatusLabel()
          }}</text>
        </view>

        <view testID="notifications-present-card" class="capability-card">
          <text class="capability-card-title">Present</text>
          <view class="button-row">
            <ActionButton
              testID="notifications-present-now"
              title="Present now"
              (press)="presentNow()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="notifications-dismiss-all-presented"
              title="Dismiss all"
              (press)="dismissAllPresented()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="notifications-list-presented"
              title="List presented"
              (press)="listPresented()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="notifications-present-status" class="value-text">{{
            presentedLabel()
          }}</text>
        </view>

        <view testID="notifications-badge-card" class="capability-card">
          <text class="capability-card-title">Badge count</text>
          <view class="button-row">
            <ActionButton
              testID="notifications-badge-refresh"
              title="Refresh"
              (press)="refreshBadgeCount()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="notifications-badge-decrement"
              title="-1"
              (press)="adjustBadgeCount(-1)"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="notifications-badge-increment"
              title="+1"
              (press)="adjustBadgeCount(1)"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="notifications-badge-count" class="value-text">{{
            badgeCountLabel()
          }}</text>
        </view>

        @if (Platform.OS === 'android') {
          <view testID="notifications-channel-card" class="capability-card">
            <text class="capability-card-title">Android channel</text>
            <view class="button-row">
              <ActionButton
                testID="notifications-set-channel"
                title="Set demo channel"
                (press)="setDemoChannel()"
                [color]="lineColor"
              ></ActionButton>
              <ActionButton
                testID="notifications-list-channels"
                title="List channels"
                (press)="listChannels()"
                [color]="lineColor"
              ></ActionButton>
            </view>
            <text testID="notifications-channel-list" class="value-text">{{
              channelListLabel()
            }}</text>
          </view>
        }

        <view testID="notifications-listener-card" class="capability-card">
          <text class="capability-card-title">Listeners</text>
          <text testID="notifications-listener-log" class="capability-label">{{
            listenerEventsLabel()
          }}</text>
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class NotificationsScreen implements OnInit, OnDestroy {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Notifications];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };
  readonly Platform = Platform;

  // --- permissions ---
  private readonly permissionStatus =
    signal<INotificationPermissionsStatus | null>(null);
  private readonly permissionError = signal<string | null>(null);

  async requestPermission(): Promise<void> {
    try {
      this.permissionStatus.set(await requestPermissionsAsync());
      this.permissionError.set(null);
    } catch (error) {
      this.permissionError.set(errorMessage(error));
    }
  }

  async getPermission(): Promise<void> {
    try {
      this.permissionStatus.set(await getPermissionsAsync());
      this.permissionError.set(null);
    } catch (error) {
      this.permissionError.set(errorMessage(error));
    }
  }

  permissionStatusLabel(): string {
    const error = this.permissionError();
    if (error) return error;
    const status = this.permissionStatus();
    return status
      ? `${status.status} (granted: ${status.granted})`
      : 'not checked yet';
  }

  // --- schedule ---
  private readonly scheduledIdentifier = signal<string | null>(null);
  private readonly scheduledList = signal<INotificationRequest[] | null>(null);
  private readonly scheduleError = signal<string | null>(null);

  async scheduleDemo(): Promise<void> {
    try {
      const identifier = await scheduleNotificationAsync({
        content: {
          title: 'Symbiote demo',
          body: `Fires in ${SCHEDULE_DELAY_SECONDS}s`,
        },
        trigger: {
          type: SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: SCHEDULE_DELAY_SECONDS,
        },
      });
      this.scheduledIdentifier.set(identifier);
      this.scheduleError.set(null);
    } catch (error) {
      this.scheduleError.set(errorMessage(error));
    }
  }

  async cancelAllScheduled(): Promise<void> {
    try {
      await cancelAllScheduledNotificationsAsync();
      this.scheduledIdentifier.set(null);
      this.scheduleError.set(null);
    } catch (error) {
      this.scheduleError.set(errorMessage(error));
    }
  }

  async listScheduled(): Promise<void> {
    try {
      this.scheduledList.set(await getAllScheduledNotificationsAsync());
      this.scheduleError.set(null);
    } catch (error) {
      this.scheduleError.set(errorMessage(error));
    }
  }

  scheduleStatusLabel(): string {
    const error = this.scheduleError();
    if (error) return error;
    const identifier = this.scheduledIdentifier();
    const list = this.scheduledList();
    const parts: string[] = [];
    if (identifier) parts.push(`scheduled: ${identifier}`);
    parts.push(list ? `${list.length} scheduled` : 'not listed yet');
    return parts.join(' · ');
  }

  // --- present ---
  private readonly presentedList = signal<INotification[] | null>(null);
  private readonly presentError = signal<string | null>(null);

  async presentNow(): Promise<void> {
    try {
      await scheduleNotificationAsync({
        content: { title: 'Symbiote demo', body: 'Presented immediately' },
        trigger: null,
      });
      this.presentError.set(null);
    } catch (error) {
      this.presentError.set(errorMessage(error));
    }
  }

  async dismissAllPresented(): Promise<void> {
    try {
      await dismissAllNotificationsAsync();
      this.presentError.set(null);
    } catch (error) {
      this.presentError.set(errorMessage(error));
    }
  }

  async listPresented(): Promise<void> {
    try {
      this.presentedList.set(await getPresentedNotificationsAsync());
      this.presentError.set(null);
    } catch (error) {
      this.presentError.set(errorMessage(error));
    }
  }

  presentedLabel(): string {
    const error = this.presentError();
    if (error) return error;
    const list = this.presentedList();
    return list ? `${list.length} presented` : 'not listed yet';
  }

  // --- badge ---
  private readonly badgeCount = signal<number | null>(null);
  private readonly badgeError = signal<string | null>(null);

  async refreshBadgeCount(): Promise<void> {
    try {
      this.badgeCount.set(await getBadgeCountAsync());
      this.badgeError.set(null);
    } catch (error) {
      this.badgeError.set(errorMessage(error));
    }
  }

  async adjustBadgeCount(delta: number): Promise<void> {
    try {
      const current = this.badgeCount() ?? (await getBadgeCountAsync());
      const next = Math.max(0, current + delta);
      await setBadgeCountAsync(next);
      this.badgeCount.set(next);
      this.badgeError.set(null);
    } catch (error) {
      this.badgeError.set(errorMessage(error));
    }
  }

  badgeCountLabel(): string {
    const error = this.badgeError();
    if (error) return error;
    const count = this.badgeCount();
    return count === null ? 'not loaded yet' : String(count);
  }

  // --- channels (Android only) ---
  private readonly channelList = signal<INotificationChannel[] | null>(null);
  private readonly channelError = signal<string | null>(null);

  async setDemoChannel(): Promise<void> {
    try {
      await setNotificationChannelAsync(DEMO_CHANNEL_ID, {
        name: 'Symbiote demo channel',
        importance: AndroidImportance.DEFAULT,
      });
      this.channelError.set(null);
    } catch (error) {
      this.channelError.set(errorMessage(error));
    }
  }

  async listChannels(): Promise<void> {
    try {
      this.channelList.set(await getNotificationChannelsAsync());
      this.channelError.set(null);
    } catch (error) {
      this.channelError.set(errorMessage(error));
    }
  }

  channelListLabel(): string {
    const error = this.channelError();
    if (error) return error;
    const channels = this.channelList();
    if (!channels) return 'not listed yet';
    return `${channels.length} channels: ${
      channels.map(channel => channel.id).join(', ') || '—'
    }`;
  }

  // --- listeners ---
  private readonly listenerEvents = signal<string[]>([]);
  private receivedSubscription: ReturnType<
    typeof addNotificationReceivedListener
  > | null = null;
  private responseSubscription: ReturnType<
    typeof addNotificationResponseReceivedListener
  > | null = null;

  ngOnInit(): void {
    this.receivedSubscription = addNotificationReceivedListener(
      notification => {
        this.pushListenerEvent(
          `received: ${notification.request.content.title ?? '(no title)'}`,
        );
      },
    );
    this.responseSubscription = addNotificationResponseReceivedListener(
      response => {
        const action =
          response.actionIdentifier === DEFAULT_ACTION_IDENTIFIER
            ? 'tapped'
            : response.actionIdentifier;
        this.pushListenerEvent(`response: ${action}`);
      },
    );
  }

  ngOnDestroy(): void {
    this.receivedSubscription?.remove();
    this.responseSubscription?.remove();
  }

  private pushListenerEvent(label: string): void {
    this.listenerEvents.update(events =>
      [label, ...events].slice(0, MAX_LISTENER_EVENTS),
    );
  }

  listenerEventsLabel(): string {
    const events = this.listenerEvents();
    return events.length === 0 ? 'no events yet' : events.join(' · ');
  }
}
