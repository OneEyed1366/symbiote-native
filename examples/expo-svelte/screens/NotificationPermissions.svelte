<script lang="ts">
  import {
    IosAlertStyle,
    IosAllowsPreviews,
    IosAuthorizationStatus,
    PermissionStatus,
    getBadgeCountAsync,
    getPermissionsAsync,
    requestPermissionsAsync,
    setBadgeCountAsync,
  } from '@symbiote-native/notifications/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.Notifications);

  type IPermissionForm = {
    allowAlert: boolean;
    allowBadge: boolean;
    allowSound: boolean;
    allowDisplayInCarPlay: boolean;
    allowCriticalAlerts: boolean;
    provideAppNotificationSettings: boolean;
    allowProvisional: boolean;
  };

  let form = $state<IPermissionForm>({
    allowAlert: true,
    allowBadge: true,
    allowSound: true,
    allowDisplayInCarPlay: false,
    allowCriticalAlerts: false,
    provideAppNotificationSettings: false,
    allowProvisional: false,
  });
  let badge = $state('3');
</script>

<Card testID="notifications-permission-card" title="requestPermissionsAsync (iOS flags)">
  <ToggleRow
    testID="notifications-allow-alert-switch"
    label="allowAlert"
    value={form.allowAlert}
    onChange={allowAlert => {
      form.allowAlert = allowAlert;
    }}
    {color}
  />
  <ToggleRow
    testID="notifications-allow-badge-switch"
    label="allowBadge"
    value={form.allowBadge}
    onChange={allowBadge => {
      form.allowBadge = allowBadge;
    }}
    {color}
  />
  <ToggleRow
    testID="notifications-allow-sound-switch"
    label="allowSound"
    value={form.allowSound}
    onChange={allowSound => {
      form.allowSound = allowSound;
    }}
    {color}
  />
  <ToggleRow
    testID="notifications-allow-carplay-switch"
    label="allowDisplayInCarPlay"
    value={form.allowDisplayInCarPlay}
    onChange={allowDisplayInCarPlay => {
      form.allowDisplayInCarPlay = allowDisplayInCarPlay;
    }}
    {color}
  />
  <ToggleRow
    testID="notifications-allow-critical-switch"
    label="allowCriticalAlerts"
    value={form.allowCriticalAlerts}
    onChange={allowCriticalAlerts => {
      form.allowCriticalAlerts = allowCriticalAlerts;
    }}
    {color}
  />
  <ToggleRow
    testID="notifications-settings-switch"
    label="provideAppNotificationSettings"
    value={form.provideAppNotificationSettings}
    onChange={provideAppNotificationSettings => {
      form.provideAppNotificationSettings = provideAppNotificationSettings;
    }}
    {color}
  />
  <ToggleRow
    testID="notifications-provisional-switch"
    label="allowProvisional"
    value={form.allowProvisional}
    onChange={allowProvisional => {
      form.allowProvisional = allowProvisional;
    }}
    {color}
  />
</Card>
<Card testID="notifications-badge-card" title="Badge input">
  <Field
    testID="notifications-badge-input"
    label="badge count"
    value={badge}
    onChange={next => {
      badge = next;
    }}
  />
</Card>
<CallConsole
  prefix="notifications-permissions"
  title="Permissions and badge"
  {color}
  calls={[
    { label: 'getPermissionsAsync', run: () => getPermissionsAsync() },
    { label: 'requestPermissionsAsync', run: () => requestPermissionsAsync({ ios: { ...form } }) },
    { label: 'requestPermissionsAsync (defaults)', run: () => requestPermissionsAsync() },
    { label: 'setBadgeCountAsync', run: () => setBadgeCountAsync(Number(badge)) },
    { label: 'getBadgeCountAsync', run: () => getBadgeCountAsync() },
    {
      label: 'status enums',
      run: async () => ({
        IosAuthorizationStatus,
        IosAlertStyle,
        IosAllowsPreviews,
        PermissionStatus,
      }),
    },
  ]}
/>
