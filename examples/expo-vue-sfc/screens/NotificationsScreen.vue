<script lang="ts">
import { setNotificationHandler } from '@symbiote-native/notifications/vue';

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

<script setup lang="ts">
import Explorer from '../components/Explorer.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import NotificationChannels from './NotificationChannels.vue';
import NotificationEvents from './NotificationEvents.vue';
import NotificationHandler from './NotificationHandler.vue';
import NotificationPermissions from './NotificationPermissions.vue';
import NotificationScenarios from './NotificationScenarios.vue';
import NotificationSchedule from './NotificationSchedule.vue';
import NotificationTokens from './NotificationTokens.vue';

const ROUTE = ROUTE_NAME.Notifications;
const color = lineColorOf(ROUTE);
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="notifications-scroll"
    title="Notifications"
    body="Reach users outside the app: local reminders, badges and banners, Android channels, action buttons and push tokens. Start with the two scenarios, everything else is in the explorer."
  >
    <NotificationScenarios />
    <NotificationEvents />
    <Explorer testID="notifications-explorer" :color="color">
      <NotificationPermissions />
      <NotificationHandler />
      <NotificationSchedule />
      <NotificationChannels />
      <NotificationTokens />
    </Explorer>
  </ScreenShell>
</template>
