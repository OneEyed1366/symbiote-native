import { Component, input, signal } from '@angular/core';
import {
  ActivityType,
  GeofencingEventType,
  GeofencingRegionState,
  hasStartedGeofencingAsync,
  hasStartedLocationUpdatesAsync,
  isBackgroundLocationAvailableAsync,
  startGeofencingAsync,
  startLocationUpdatesAsync,
  stopGeofencingAsync,
  stopLocationUpdatesAsync,
} from '@symbiote-native/location/angular';
import type {
  ILocationRegion,
  ILocationTaskOptions,
} from '@symbiote-native/location/angular';
import { dlog } from '@symbiote-native/engine';
import { defineTask } from '@symbiote-native/task-manager';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { optionalNumber, toLocationOptions } from './location-options';
import type { IOptionsForm } from './location-options';

const UPDATES_TASK = 'expo-location-canary-updates';
const GEOFENCING_TASK = 'expo-location-canary-geofencing';

// Both run at module top level, the app can be launched headlessly to run them
defineTask(UPDATES_TASK, async ({ data, error }) => {
  if (error) {
    console.error(`${UPDATES_TASK} failed:`, error);
    return;
  }
  dlog(() => `${UPDATES_TASK} received: ${JSON.stringify(data)}`);
});

defineTask(GEOFENCING_TASK, async ({ data, error }) => {
  if (error) {
    console.error(`${GEOFENCING_TASK} failed:`, error);
    return;
  }
  dlog(() => `${GEOFENCING_TASK} received: ${JSON.stringify(data)}`);
});

const ACTIVITY_TYPES = [
  { label: 'Other', value: ActivityType.Other },
  { label: 'AutomotiveNavigation', value: ActivityType.AutomotiveNavigation },
  { label: 'Fitness', value: ActivityType.Fitness },
  { label: 'OtherNavigation', value: ActivityType.OtherNavigation },
  { label: 'Airborne', value: ActivityType.Airborne },
] as const;

const GEOFENCE_HINT = `Events carry a GeofencingEventType (${GeofencingEventType.Enter} enter, ${GeofencingEventType.Exit} exit) and a GeofencingRegionState (${GeofencingRegionState.Unknown} unknown, ${GeofencingRegionState.Inside} inside, ${GeofencingRegionState.Outside} outside), logged when DEBUG is on. Needs the background permission.`;

@Component({
  selector: 'LocationBackground',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card testID="location-task-card" title="Background task options">
      <ToggleRow
        testID="location-indicator-switch"
        label="showsBackgroundLocationIndicator (iOS)"
        [(value)]="showsIndicator"
        [color]="color"
      />
      <Field
        testID="location-deferred-distance-input"
        label="deferredUpdatesDistance (iOS)"
        [(value)]="deferredDistance"
      />
      <Field
        testID="location-deferred-timeout-input"
        label="deferredUpdatesTimeout (iOS)"
        [(value)]="deferredTimeout"
      />
      <Field
        testID="location-deferred-interval-input"
        label="deferredUpdatesInterval (Android)"
        [(value)]="deferredInterval"
      />
      <ChoiceRow
        testID="location-activity-type"
        label="activityType (iOS)"
        [options]="activityTypes"
        [(value)]="activityType"
        [color]="color"
      />
      <ToggleRow
        testID="location-pauses-switch"
        label="pausesUpdatesAutomatically (iOS)"
        [(value)]="pausesAutomatically"
        [color]="color"
      />
      <ToggleRow
        testID="location-foreground-service-toggle"
        label="foregroundService (Android)"
        [(value)]="isForegroundService"
        [color]="color"
      />
      <Field
        testID="location-notification-title-input"
        label="notificationTitle"
        [(value)]="notificationTitle"
      />
      <Field
        testID="location-notification-body-input"
        label="notificationBody"
        [(value)]="notificationBody"
      />
      <Field
        testID="location-notification-color-input"
        label="notificationColor"
        [(value)]="notificationColor"
      />
      <ToggleRow
        testID="location-kill-switch"
        label="killServiceOnDestroy"
        [(value)]="killServiceOnDestroy"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="location-background-calls"
      title="Background location updates"
      [color]="color"
      hint="The foreground service option needs FOREGROUND_SERVICE and FOREGROUND_SERVICE_LOCATION in the app manifest, without them Android rejects the start."
      [calls]="updateCalls"
    />
    <Card testID="location-geofence-card" title="Geofencing region">
      <Field
        testID="location-region-id-input"
        label="identifier"
        [(value)]="identifier"
      />
      <Field
        testID="location-region-lat-input"
        label="latitude"
        [(value)]="latitude"
      />
      <Field
        testID="location-region-lon-input"
        label="longitude"
        [(value)]="longitude"
      />
      <Field
        testID="location-region-radius-input"
        label="radius (meters)"
        [(value)]="radius"
      />
      <ToggleRow
        testID="location-region-enter-switch"
        label="notifyOnEnter"
        [(value)]="notifyOnEnter"
        [color]="color"
      />
      <ToggleRow
        testID="location-region-exit-switch"
        label="notifyOnExit"
        [(value)]="notifyOnExit"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="location-geofencing-calls"
      title="Geofencing"
      [color]="color"
      [hint]="geofenceHint"
      [calls]="geofencingCalls"
    />
  `,
})
export class LocationBackground {
  readonly options = input.required<IOptionsForm>();
  readonly color = lineColorOf(ROUTE_NAME.Location);
  readonly activityTypes = ACTIVITY_TYPES;
  readonly geofenceHint = GEOFENCE_HINT;

  readonly showsIndicator = signal(false);
  readonly deferredDistance = signal('');
  readonly deferredTimeout = signal('');
  readonly deferredInterval = signal('');
  readonly activityType = signal<ActivityType>(ActivityType.Other);
  readonly pausesAutomatically = signal(false);
  readonly isForegroundService = signal(false);
  readonly notificationTitle = signal('Location canary');
  readonly notificationBody = signal(
    'Tracking your position in the background.',
  );
  readonly notificationColor = signal('');
  readonly killServiceOnDestroy = signal(false);

  readonly identifier = signal('canary-region');
  readonly latitude = signal('37.33');
  readonly longitude = signal('-122.03');
  readonly radius = signal('200');
  readonly notifyOnEnter = signal(true);
  readonly notifyOnExit = signal(true);

  private toTaskOptions(): ILocationTaskOptions {
    return {
      ...toLocationOptions(this.options()),
      showsBackgroundLocationIndicator: this.showsIndicator(),
      deferredUpdatesDistance: optionalNumber(this.deferredDistance()),
      deferredUpdatesTimeout: optionalNumber(this.deferredTimeout()),
      deferredUpdatesInterval: optionalNumber(this.deferredInterval()),
      activityType: this.activityType(),
      pausesUpdatesAutomatically: this.pausesAutomatically(),
      foregroundService: this.isForegroundService()
        ? {
            notificationTitle: this.notificationTitle(),
            notificationBody: this.notificationBody(),
            notificationColor:
              this.notificationColor() === ''
                ? undefined
                : this.notificationColor(),
            killServiceOnDestroy: this.killServiceOnDestroy(),
          }
        : undefined,
    };
  }

  private toRegion(): ILocationRegion {
    return {
      identifier: this.identifier(),
      latitude: Number(this.latitude()),
      longitude: Number(this.longitude()),
      radius: Number(this.radius()),
      notifyOnEnter: this.notifyOnEnter(),
      notifyOnExit: this.notifyOnExit(),
    };
  }

  readonly updateCalls = [
    {
      label: 'isBackgroundLocationAvailableAsync',
      run: () => isBackgroundLocationAvailableAsync(),
    },
    {
      label: 'startLocationUpdatesAsync',
      run: () => startLocationUpdatesAsync(UPDATES_TASK, this.toTaskOptions()),
    },
    {
      label: 'hasStartedLocationUpdatesAsync',
      run: () => hasStartedLocationUpdatesAsync(UPDATES_TASK),
    },
    {
      label: 'stopLocationUpdatesAsync',
      run: () => stopLocationUpdatesAsync(UPDATES_TASK),
    },
  ];

  readonly geofencingCalls = [
    {
      label: 'startGeofencingAsync',
      run: () => startGeofencingAsync(GEOFENCING_TASK, [this.toRegion()]),
    },
    {
      label: 'hasStartedGeofencingAsync',
      run: () => hasStartedGeofencingAsync(GEOFENCING_TASK),
    },
    {
      label: 'stopGeofencingAsync',
      run: () => stopGeofencingAsync(GEOFENCING_TASK),
    },
  ];
}
