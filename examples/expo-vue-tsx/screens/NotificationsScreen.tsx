import { setNotificationHandler } from '@symbiote-native/notifications/vue';
import { Explorer } from '../components/Scenario';
import { ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { ChannelCards } from './notifications-channels';
import { EventCards } from './notifications-events';
import { NotificationScenarios } from './notifications-scenarios';
import { ScheduleCards } from './notifications-schedule';
import { SetupCards } from './notifications-setup';
import { TokenCards } from './notifications-tokens';

// Foreground notifications show by default; the handler card below replaces this at runtime
setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function NotificationsScreen() {
  return (
    <ScreenShell
      route={ROUTE_NAME.Notifications}
      testID="notifications-scroll"
      title="Notifications"
      body="Reach users outside the app: local reminders, badges and banners, Android channels, action buttons and push tokens. Start with the two scenarios, everything else is in the explorer."
    >
      <NotificationScenarios />
      <EventCards />
      <Explorer testID="notifications-explorer" color={lineColorOf(ROUTE_NAME.Notifications)}>
        <SetupCards />
        <ScheduleCards />
        <ChannelCards />
        <TokenCards />
      </Explorer>
    </ScreenShell>
  );
}
