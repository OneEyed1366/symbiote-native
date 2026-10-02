<script module lang="ts">
  import { setNotificationHandler } from '@symbiote-native/notifications/svelte';

  // Foreground notifications show by default, the handler card replaces this at runtime
  setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
</script>

<script lang="ts">
  import Explorer from '../components/Explorer.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import NotificationChannels from './NotificationChannels.svelte';
  import NotificationEvents from './NotificationEvents.svelte';
  import NotificationHandler from './NotificationHandler.svelte';
  import NotificationPermissions from './NotificationPermissions.svelte';
  import NotificationScenarios from './NotificationScenarios.svelte';
  import NotificationSchedule from './NotificationSchedule.svelte';
  import NotificationTokens from './NotificationTokens.svelte';

  const ROUTE = ROUTE_NAME.Notifications;
</script>

<ScreenShell
  route={ROUTE}
  testID="notifications-scroll"
  title="Notifications"
  body="Reach users outside the app: local reminders, badges and banners, Android channels, action buttons and push tokens. Start with the two scenarios, everything else is in the explorer."
>
  <NotificationScenarios />
  <NotificationEvents />
  <Explorer testID="notifications-explorer" color={lineColorOf(ROUTE)}>
    <NotificationPermissions />
    <NotificationHandler />
    <NotificationSchedule />
    <NotificationChannels />
    <NotificationTokens />
  </Explorer>
</ScreenShell>
