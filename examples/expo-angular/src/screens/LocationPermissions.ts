import { Component, computed, inject } from '@angular/core';
import {
  BackgroundPermissionsService,
  ForegroundPermissionsService,
  MotionActivityPermissionsService,
  enableNetworkProviderAsync,
  getBackgroundPermissionsAsync,
  getForegroundPermissionsAsync,
  getMotionActivityPermissionsAsync,
  getProviderStatusAsync,
  hasServicesEnabledAsync,
  requestBackgroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  requestMotionActivityPermissionsAsync,
} from '@symbiote-native/location/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ResultRow } from '../components/ResultRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

function permissionLabel(
  response: { status: string; granted: boolean } | null,
): string {
  return response === null
    ? 'loading…'
    : `${response.status}, granted ${response.granted}`;
}

@Component({
  selector: 'LocationPermissions',
  standalone: true,
  imports: [CallConsole, Card, ResultRow],
  template: `
    <Card testID="location-permissions-card" title="Permission hooks">
      <ResultRow
        testID="location-foreground-row"
        label="useForegroundPermissions"
        [value]="foregroundText()"
      />
      <ResultRow
        testID="location-background-row"
        label="useBackgroundPermissions"
        [value]="backgroundText()"
      />
      <ResultRow
        testID="location-motion-row"
        label="useMotionActivityPermissions"
        [value]="motionText()"
      />
    </Card>
    <CallConsole
      prefix="location-permission-calls"
      title="Permission calls"
      [color]="color"
      hint="Background permission needs the foreground one first, a rejection there can be expected on a simulator."
      [calls]="calls"
    />
  `,
})
export class LocationPermissions {
  readonly color = lineColorOf(ROUTE_NAME.Location);

  private readonly foreground = inject(ForegroundPermissionsService).connect();
  private readonly background = inject(BackgroundPermissionsService).connect();
  private readonly motion = inject(MotionActivityPermissionsService).connect();

  readonly foregroundText = computed(() => permissionLabel(this.foreground()));
  readonly backgroundText = computed(() => permissionLabel(this.background()));
  readonly motionText = computed(() => permissionLabel(this.motion()));

  readonly calls = [
    {
      label: 'getForegroundPermissionsAsync',
      run: () => getForegroundPermissionsAsync(),
    },
    {
      label: 'requestForegroundPermissionsAsync',
      run: () => requestForegroundPermissionsAsync(),
    },
    {
      label: 'getBackgroundPermissionsAsync',
      run: () => getBackgroundPermissionsAsync(),
    },
    {
      label: 'requestBackgroundPermissionsAsync',
      run: () => requestBackgroundPermissionsAsync(),
    },
    {
      label: 'getMotionActivityPermissionsAsync',
      run: () => getMotionActivityPermissionsAsync(),
    },
    {
      label: 'requestMotionActivityPermissionsAsync',
      run: () => requestMotionActivityPermissionsAsync(),
    },
    { label: 'hasServicesEnabledAsync', run: () => hasServicesEnabledAsync() },
    { label: 'getProviderStatusAsync', run: () => getProviderStatusAsync() },
    {
      label: 'enableNetworkProviderAsync (Android)',
      run: () => enableNetworkProviderAsync(),
    },
  ];
}
