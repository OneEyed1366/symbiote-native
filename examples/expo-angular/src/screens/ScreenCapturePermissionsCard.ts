import { Component, computed, inject, signal } from '@angular/core';
import {
  PermissionsService,
  getPermissionsAsync,
  requestPermissionsAsync,
} from '@symbiote-native/screen-capture/angular';
import type { PermissionResponse } from '@symbiote-native/screen-capture/angular';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { ResultRow } from '../components/ResultRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

function describePermission(response: PermissionResponse | null): string {
  return response === null
    ? 'loading…'
    : `${response.status}, granted ${response.granted}, canAskAgain ${response.canAskAgain}`;
}

@Component({
  selector: 'ScreenCapturePermissionsCard',
  standalone: true,
  imports: [ActionButton, Card, ResultRow],
  template: `
    <Card testID="screen-capture-permissions-card" title="Permissions">
      <ResultRow
        testID="screen-capture-permission-hook"
        label="usePermissions state"
        [value]="hookState()"
      />
      <ActionButton
        testID="screen-capture-hook-request"
        title="hook request()"
        [color]="color"
        (press)="permissions.request()"
      />
      <ActionButton
        testID="screen-capture-hook-get"
        title="hook get()"
        [color]="color"
        (press)="permissions.get()"
      />
      <ActionButton
        testID="screen-capture-get-button"
        title="getPermissionsAsync"
        [color]="color"
        (press)="run(getPermissions)"
      />
      <ActionButton
        testID="screen-capture-request-button"
        title="requestPermissionsAsync"
        [color]="color"
        (press)="run(requestPermissions)"
      />
      <ResultRow
        testID="screen-capture-direct"
        label="direct call"
        [value]="direct()"
      />
    </Card>
  `,
})
export class ScreenCapturePermissionsCard {
  readonly color = lineColorOf(ROUTE_NAME.ScreenCapture);
  readonly permissions = inject(PermissionsService);
  readonly getPermissions = getPermissionsAsync;
  readonly requestPermissions = requestPermissionsAsync;

  private readonly status = this.permissions.connect();
  readonly direct = signal('not called');

  readonly hookState = computed(
    () =>
      this.permissions.error()?.message ?? describePermission(this.status()),
  );

  run(call: () => Promise<PermissionResponse>): void {
    call()
      .then(response => this.direct.set(describePermission(response)))
      .catch((failure: Error) => this.direct.set(`failed: ${failure.message}`));
  }
}
