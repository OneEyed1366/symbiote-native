import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  NotificationTimeoutError,
  setNotificationHandler,
} from '@symbiote-native/notifications/angular';
import type { INotificationBehavior } from '@symbiote-native/notifications/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

@Component({
  selector: 'NotificationHandler',
  standalone: true,
  imports: [CallConsole, Card, Field, SYMBIOTE_ELEMENTS, ToggleRow],
  template: `
    <Card
      testID="notifications-handler-card"
      title="setNotificationHandler behavior"
    >
      <ToggleRow
        testID="notifications-banner-switch"
        label="shouldShowBanner"
        [(value)]="shouldShowBanner"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-list-switch"
        label="shouldShowList"
        [(value)]="shouldShowList"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-sound-switch"
        label="shouldPlaySound"
        [(value)]="shouldPlaySound"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-set-badge-switch"
        label="shouldSetBadge"
        [(value)]="shouldSetBadge"
        [color]="color"
      />
      <Field
        testID="notifications-delay-input"
        label="handleNotification delay ms (over 3000 times out)"
        [(value)]="delay"
      />
      <ToggleRow
        testID="notifications-failing-switch"
        label="handleNotification throws"
        [(value)]="isFailing"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="notifications-handler"
      title="Notification handler"
      [color]="color"
      hint="Schedule a notification with the app in the foreground to see the handler run."
      [calls]="calls"
    />
    <text testID="notifications-handler-log" class="info-text">{{
      log()
    }}</text>
  `,
})
export class NotificationHandler {
  readonly color = lineColorOf(ROUTE_NAME.Notifications);

  readonly shouldShowBanner = signal(true);
  readonly shouldShowList = signal(true);
  readonly shouldPlaySound = signal(false);
  readonly shouldSetBadge = signal(false);
  readonly delay = signal('0');
  readonly isFailing = signal(false);
  readonly log = signal('handler not installed');

  private async install(): Promise<string> {
    setNotificationHandler({
      handleNotification: async () => {
        await wait(Number(this.delay()));
        if (this.isFailing()) {
          throw new Error('handleNotification failed on purpose');
        }
        const behavior: INotificationBehavior = {
          shouldShowBanner: this.shouldShowBanner(),
          shouldShowList: this.shouldShowList(),
          shouldPlaySound: this.shouldPlaySound(),
          shouldSetBadge: this.shouldSetBadge(),
        };
        return behavior;
      },
      handleSuccess: id => this.log.set(`handleSuccess ${id}`),
      handleError: (id, error) => {
        this.log.set(
          `handleError ${id}: ${error instanceof NotificationTimeoutError ? 'NotificationTimeoutError' : error.message}`,
        );
      },
    });
    return 'handler installed';
  }

  readonly calls = [
    { label: 'setNotificationHandler', run: () => this.install() },
    {
      label: 'setNotificationHandler (null)',
      run: async () => {
        setNotificationHandler(null);
        return 'handler removed';
      },
    },
  ];
}
