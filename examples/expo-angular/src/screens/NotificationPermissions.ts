import { Component, signal } from '@angular/core';
import {
  IosAlertStyle,
  IosAllowsPreviews,
  IosAuthorizationStatus,
  PermissionStatus,
  getBadgeCountAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  setBadgeCountAsync,
} from '@symbiote-native/notifications/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

@Component({
  selector: 'NotificationPermissions',
  standalone: true,
  imports: [CallConsole, Card, Field, ToggleRow],
  template: `
    <Card
      testID="notifications-permission-card"
      title="requestPermissionsAsync (iOS flags)"
    >
      <ToggleRow
        testID="notifications-allow-alert-switch"
        label="allowAlert"
        [(value)]="allowAlert"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-allow-badge-switch"
        label="allowBadge"
        [(value)]="allowBadge"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-allow-sound-switch"
        label="allowSound"
        [(value)]="allowSound"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-allow-carplay-switch"
        label="allowDisplayInCarPlay"
        [(value)]="allowDisplayInCarPlay"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-allow-critical-switch"
        label="allowCriticalAlerts"
        [(value)]="allowCriticalAlerts"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-settings-switch"
        label="provideAppNotificationSettings"
        [(value)]="provideAppNotificationSettings"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-provisional-switch"
        label="allowProvisional"
        [(value)]="allowProvisional"
        [color]="color"
      />
    </Card>
    <Card testID="notifications-badge-card" title="Badge input">
      <Field
        testID="notifications-badge-input"
        label="badge count"
        [(value)]="badge"
      />
    </Card>
    <CallConsole
      prefix="notifications-permissions"
      title="Permissions and badge"
      [color]="color"
      [calls]="calls"
    />
  `,
})
export class NotificationPermissions {
  readonly color = lineColorOf(ROUTE_NAME.Notifications);

  readonly allowAlert = signal(true);
  readonly allowBadge = signal(true);
  readonly allowSound = signal(true);
  readonly allowDisplayInCarPlay = signal(false);
  readonly allowCriticalAlerts = signal(false);
  readonly provideAppNotificationSettings = signal(false);
  readonly allowProvisional = signal(false);
  readonly badge = signal('3');

  readonly calls = [
    { label: 'getPermissionsAsync', run: () => getPermissionsAsync() },
    {
      label: 'requestPermissionsAsync',
      run: () =>
        requestPermissionsAsync({
          ios: {
            allowAlert: this.allowAlert(),
            allowBadge: this.allowBadge(),
            allowSound: this.allowSound(),
            allowDisplayInCarPlay: this.allowDisplayInCarPlay(),
            allowCriticalAlerts: this.allowCriticalAlerts(),
            provideAppNotificationSettings:
              this.provideAppNotificationSettings(),
            allowProvisional: this.allowProvisional(),
          },
        }),
    },
    {
      label: 'requestPermissionsAsync (defaults)',
      run: () => requestPermissionsAsync(),
    },
    {
      label: 'setBadgeCountAsync',
      run: () => setBadgeCountAsync(Number(this.badge())),
    },
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
  ];
}
