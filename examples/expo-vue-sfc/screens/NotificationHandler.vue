<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  NotificationTimeoutError,
  setNotificationHandler,
} from '@symbiote-native/notifications/vue';
import type { INotificationBehavior } from '@symbiote-native/notifications/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Notifications);

type IHandlerForm = {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
  delay: string;
  isFailing: boolean;
};

const form = reactive<IHandlerForm>({
  shouldShowBanner: true,
  shouldShowList: true,
  shouldPlaySound: false,
  shouldSetBadge: false,
  delay: '0',
  isFailing: false,
});
const log = ref('handler not installed');

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function install(): Promise<string> {
  setNotificationHandler({
    handleNotification: async () => {
      await wait(Number(form.delay));
      if (form.isFailing) {
        throw new Error('handleNotification failed on purpose');
      }
      const behavior: INotificationBehavior = {
        shouldShowBanner: form.shouldShowBanner,
        shouldShowList: form.shouldShowList,
        shouldPlaySound: form.shouldPlaySound,
        shouldSetBadge: form.shouldSetBadge,
      };
      return behavior;
    },
    handleSuccess: id => {
      log.value = `handleSuccess ${id}`;
    },
    handleError: (id, error) => {
      log.value = `handleError ${id}: ${error instanceof NotificationTimeoutError ? 'NotificationTimeoutError' : error.message}`;
    },
  });
  return 'handler installed';
}

const calls = [
  { label: 'setNotificationHandler', run: install },
  {
    label: 'setNotificationHandler (null)',
    run: async () => {
      setNotificationHandler(null);
      return 'handler removed';
    },
  },
];
</script>

<template>
  <Card testID="notifications-handler-card" title="setNotificationHandler behavior">
    <ToggleRow
      testID="notifications-banner-switch"
      label="shouldShowBanner"
      :value="form.shouldShowBanner"
      :onChange="shouldShowBanner => (form.shouldShowBanner = shouldShowBanner)"
      :color="color"
    />
    <ToggleRow
      testID="notifications-list-switch"
      label="shouldShowList"
      :value="form.shouldShowList"
      :onChange="shouldShowList => (form.shouldShowList = shouldShowList)"
      :color="color"
    />
    <ToggleRow
      testID="notifications-sound-switch"
      label="shouldPlaySound"
      :value="form.shouldPlaySound"
      :onChange="shouldPlaySound => (form.shouldPlaySound = shouldPlaySound)"
      :color="color"
    />
    <ToggleRow
      testID="notifications-set-badge-switch"
      label="shouldSetBadge"
      :value="form.shouldSetBadge"
      :onChange="shouldSetBadge => (form.shouldSetBadge = shouldSetBadge)"
      :color="color"
    />
    <Field
      testID="notifications-delay-input"
      label="handleNotification delay ms (over 3000 times out)"
      :value="form.delay"
      :onChange="delay => (form.delay = delay)"
    />
    <ToggleRow
      testID="notifications-failing-switch"
      label="handleNotification throws"
      :value="form.isFailing"
      :onChange="isFailing => (form.isFailing = isFailing)"
      :color="color"
    />
  </Card>
  <CallConsole
    prefix="notifications-handler"
    title="Notification handler"
    :color="color"
    hint="Schedule a notification with the app in the foreground to see the handler run."
    :calls="calls"
  />
  <text testID="notifications-handler-log" class="info-text">{{ log }}</text>
</template>
