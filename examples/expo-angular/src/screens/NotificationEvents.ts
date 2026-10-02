import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  DEFAULT_ACTION_IDENTIFIER,
  LastNotificationResponseService,
  addNotificationReceivedListener,
  addNotificationResponseClearedListener,
  addNotificationResponseReceivedListener,
  addNotificationsDroppedListener,
  clearLastNotificationResponse,
  clearLastNotificationResponseAsync,
  determineNextResponse,
  getLastNotificationResponse,
  getLastNotificationResponseAsync,
} from '@symbiote-native/notifications/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ResultRow } from '../components/ResultRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const MAX_LOGGED_EVENTS = 6;

@Component({
  selector: 'NotificationEvents',
  standalone: true,
  imports: [CallConsole, Card, ResultRow, SYMBIOTE_ELEMENTS],
  template: `
    <Card testID="notifications-events-card" title="Listeners">
      <text class="info-text">
        addNotificationReceivedListener,
        addNotificationResponseReceivedListener,
        addNotificationResponseClearedListener and
        addNotificationsDroppedListener are all attached while this screen is
        open.
      </text>
      <text testID="notifications-event-log" class="info-text">{{
        logText()
      }}</text>
    </Card>
    <Card
      testID="notifications-response-card"
      title="useLastNotificationResponse"
    >
      <ResultRow
        testID="notifications-response-state"
        label="state"
        [value]="responseState()"
      />
      <ResultRow
        testID="notifications-response-id"
        label="request identifier"
        [value]="requestId()"
      />
      <ResultRow
        testID="notifications-response-action"
        label="actionIdentifier"
        [value]="responseAction()"
      />
      <ResultRow
        testID="notifications-response-text"
        label="userText"
        [value]="userText()"
      />
    </Card>
    <CallConsole
      prefix="notifications-last"
      title="Last response"
      [color]="color"
      [calls]="lastCalls"
    />
  `,
})
export class NotificationEvents {
  readonly color = lineColorOf(ROUTE_NAME.Notifications);

  private readonly lines = signal<string[]>([]);
  private readonly response = inject(LastNotificationResponseService).connect();

  readonly logText = computed(() => {
    const lines = this.lines();
    return lines.length === 0
      ? 'no events yet, schedule a notification and tap it'
      : lines.join('\n');
  });

  readonly responseState = computed((): string => {
    const response = this.response();
    if (response === undefined) {
      return 'loading';
    }
    return response === null ? 'none' : 'received';
  });

  readonly responseAction = computed((): string => {
    const current = this.response();
    if (current === undefined || current === null) {
      return 'none';
    }
    const suffix =
      current.actionIdentifier === DEFAULT_ACTION_IDENTIFIER
        ? ' (DEFAULT_ACTION_IDENTIFIER)'
        : '';
    return `${current.actionIdentifier}${suffix}`;
  });

  readonly requestId = computed(
    () => this.response()?.notification.request.identifier ?? 'none',
  );
  readonly userText = computed(() => this.response()?.userText ?? 'none');

  readonly lastCalls = [
    {
      label: 'getLastNotificationResponse',
      run: async () => getLastNotificationResponse(),
    },
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
    {
      label: 'DEFAULT_ACTION_IDENTIFIER',
      run: async () => DEFAULT_ACTION_IDENTIFIER,
    },
    {
      label: 'determineNextResponse (null clears)',
      run: async () =>
        determineNextResponse(getLastNotificationResponse(), null),
    },
  ];

  constructor() {
    const subscriptions = [
      addNotificationReceivedListener(event => {
        this.push(
          `received ${event.request.identifier}: ${event.request.content.title ?? 'no title'}`,
        );
      }),
      addNotificationResponseReceivedListener(response => {
        this.push(
          `response ${response.actionIdentifier}${response.userText === undefined ? '' : ` text=${response.userText}`}`,
        );
      }),
      addNotificationResponseClearedListener(() =>
        this.push('response cleared'),
      ),
      addNotificationsDroppedListener(() => this.push('notifications dropped')),
    ];
    inject(DestroyRef).onDestroy(() =>
      subscriptions.forEach(subscription => subscription.remove()),
    );
  }

  private push(line: string): void {
    this.lines.update(lines => [line, ...lines].slice(0, MAX_LOGGED_EVENTS));
  }
}
