<script lang="ts">
  import {
    NotificationTimeoutError,
    setNotificationHandler,
  } from '@symbiote-native/notifications/svelte';
  import type { INotificationBehavior } from '@symbiote-native/notifications/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
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

  let form = $state<IHandlerForm>({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    delay: '0',
    isFailing: false,
  });
  let log = $state('handler not installed');

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
        log = `handleSuccess ${id}`;
      },
      handleError: (id, error) => {
        log = `handleError ${id}: ${error instanceof NotificationTimeoutError ? 'NotificationTimeoutError' : error.message}`;
      },
    });
    return 'handler installed';
  }
</script>

<Card testID="notifications-handler-card" title="setNotificationHandler behavior">
  <ToggleRow
    testID="notifications-banner-switch"
    label="shouldShowBanner"
    value={form.shouldShowBanner}
    onChange={shouldShowBanner => {
      form.shouldShowBanner = shouldShowBanner;
    }}
    {color}
  />
  <ToggleRow
    testID="notifications-list-switch"
    label="shouldShowList"
    value={form.shouldShowList}
    onChange={shouldShowList => {
      form.shouldShowList = shouldShowList;
    }}
    {color}
  />
  <ToggleRow
    testID="notifications-sound-switch"
    label="shouldPlaySound"
    value={form.shouldPlaySound}
    onChange={shouldPlaySound => {
      form.shouldPlaySound = shouldPlaySound;
    }}
    {color}
  />
  <ToggleRow
    testID="notifications-set-badge-switch"
    label="shouldSetBadge"
    value={form.shouldSetBadge}
    onChange={shouldSetBadge => {
      form.shouldSetBadge = shouldSetBadge;
    }}
    {color}
  />
  <Field
    testID="notifications-delay-input"
    label="handleNotification delay ms (over 3000 times out)"
    value={form.delay}
    onChange={delay => {
      form.delay = delay;
    }}
  />
  <ToggleRow
    testID="notifications-failing-switch"
    label="handleNotification throws"
    value={form.isFailing}
    onChange={isFailing => {
      form.isFailing = isFailing;
    }}
    {color}
  />
</Card>
<CallConsole
  prefix="notifications-handler"
  title="Notification handler"
  {color}
  hint="Schedule a notification with the app in the foreground to see the handler run."
  calls={[
    { label: 'setNotificationHandler', run: install },
    {
      label: 'setNotificationHandler (null)',
      run: async () => {
        setNotificationHandler(null);
        return 'handler removed';
      },
    },
  ]}
/>
<text testID="notifications-handler-log" class="info-text">{log}</text>
