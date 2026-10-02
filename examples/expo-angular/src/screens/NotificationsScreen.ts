import { Component } from '@angular/core';
import { setNotificationHandler } from '@symbiote-native/notifications/angular';
import { Explorer } from '../components/Explorer';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { NotificationChannels } from './NotificationChannels';
import { NotificationEvents } from './NotificationEvents';
import { NotificationHandler } from './NotificationHandler';
import { NotificationPermissions } from './NotificationPermissions';
import { NotificationScenarios } from './NotificationScenarios';
import { NotificationSchedule } from './NotificationSchedule';
import { NotificationTokens } from './NotificationTokens';

// Foreground notifications show by default, the handler card replaces this at runtime
setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

@Component({
  selector: 'NotificationsScreen',
  standalone: true,
  imports: [
    Explorer,
    NotificationChannels,
    NotificationEvents,
    NotificationHandler,
    NotificationPermissions,
    NotificationScenarios,
    NotificationSchedule,
    NotificationTokens,
    ScreenShell,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="notifications-scroll"
      title="Notifications"
      body="Reach users outside the app: local reminders, badges and banners, Android channels, action buttons and push tokens. Start with the two scenarios, everything else is in the explorer."
    >
      <NotificationScenarios />
      <NotificationEvents />
      <Explorer testID="notifications-explorer" [color]="color">
        <ng-template>
          <NotificationPermissions />
          <NotificationHandler />
          <NotificationSchedule />
          <NotificationChannels />
          <NotificationTokens />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class NotificationsScreen {
  readonly route = ROUTE_NAME.Notifications;
  readonly color = lineColorOf(ROUTE_NAME.Notifications);
}
