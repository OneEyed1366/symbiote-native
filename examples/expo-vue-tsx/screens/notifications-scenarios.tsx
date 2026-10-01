import {
  SchedulableTriggerInputTypes,
  cancelAllScheduledNotificationsAsync,
  getBadgeCountAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setBadgeCountAsync,
} from '@symbiote-native/notifications/vue';
import { CallConsole } from '../components/CallConsole';
import { Scenario } from '../components/Scenario';
import { lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Notifications);
const REMINDER_SECONDS = 5;
const DEMO_BADGE = 3;

export function NotificationScenarios() {
  return (
    <>
      <Scenario
        testID="notifications-reminder-scenario"
        title="Remind the user in a few seconds"
        why="Order updates, timers and habit reminders are local notifications scheduled on the device, with no server and no push token."
        steps={['Press Allow notifications and accept', 'Press Remind me in 5 s', 'Send the app to the background and wait']}
        expect="A notification banner appears after about five seconds, even with the app closed. With the app open, the foreground handler below decides whether it shows."
      >
        <CallConsole
          isBare
          prefix="notifications-reminder"
          title="Reminder"
          color={color}
          calls={[
            { label: 'Allow notifications', run: () => requestPermissionsAsync() },
            {
              label: 'Remind me in 5 s',
              run: () =>
                scheduleNotificationAsync({
                  content: { title: 'Reminder', body: 'Scheduled from the example app', data: { screen: 'Notifications' } },
                  trigger: { type: SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: REMINDER_SECONDS },
                }),
            },
            { label: 'Cancel all reminders', run: () => cancelAllScheduledNotificationsAsync() },
          ]}
        />
      </Scenario>
      <Scenario
        testID="notifications-badge-scenario"
        title="Show an unread count on the app icon"
        why="A red number on the icon tells users that something is waiting, for example unread messages or pending orders."
        steps={['Press Set badge to 3', 'Go to the home screen and look at the icon', 'Press Clear badge']}
        expect="The app icon shows 3 and then no badge. On Android the launcher decides whether to show a number or just a dot."
      >
        <CallConsole
          isBare
          prefix="notifications-badge"
          title="Badge"
          color={color}
          calls={[
            { label: 'Set badge to 3', run: () => setBadgeCountAsync(DEMO_BADGE) },
            { label: 'Clear badge', run: () => setBadgeCountAsync(0) },
            { label: 'Read badge', run: () => getBadgeCountAsync() },
          ]}
        />
      </Scenario>
    </>
  );
}
