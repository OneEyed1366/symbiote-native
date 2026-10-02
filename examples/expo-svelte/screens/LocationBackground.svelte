<script module lang="ts">
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
  } from '@symbiote-native/location/svelte';
  import { dlog } from '@symbiote-native/engine';
  import { defineTask } from '@symbiote-native/task-manager';

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
</script>

<script lang="ts">
  import type { ILocationRegion, ILocationTaskOptions } from '@symbiote-native/location/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { optionalNumber, toLocationOptions } from './location-options';
  import type { IOptionsForm } from './location-options';

  let { options }: { options: IOptionsForm } = $props();

  const color = lineColorOf(ROUTE_NAME.Location);
  const ACTIVITY_TYPES = [
    { label: 'Other', value: ActivityType.Other },
    { label: 'AutomotiveNavigation', value: ActivityType.AutomotiveNavigation },
    { label: 'Fitness', value: ActivityType.Fitness },
    { label: 'OtherNavigation', value: ActivityType.OtherNavigation },
    { label: 'Airborne', value: ActivityType.Airborne },
  ] as const;

  type ITaskForm = {
    showsIndicator: boolean;
    deferredDistance: string;
    deferredTimeout: string;
    deferredInterval: string;
    activityType: ActivityType;
    pausesAutomatically: boolean;
    isForegroundService: boolean;
    notificationTitle: string;
    notificationBody: string;
    notificationColor: string;
    killServiceOnDestroy: boolean;
  };

  let form = $state<ITaskForm>({
    showsIndicator: false,
    deferredDistance: '',
    deferredTimeout: '',
    deferredInterval: '',
    activityType: ActivityType.Other,
    pausesAutomatically: false,
    isForegroundService: false,
    notificationTitle: 'Location canary',
    notificationBody: 'Tracking your position in the background.',
    notificationColor: '',
    killServiceOnDestroy: false,
  });

  let identifier = $state('canary-region');
  let latitude = $state('37.33');
  let longitude = $state('-122.03');
  let radius = $state('200');
  let notifyOnEnter = $state(true);
  let notifyOnExit = $state(true);

  function toTaskOptions(): ILocationTaskOptions {
    return {
      ...toLocationOptions(options),
      showsBackgroundLocationIndicator: form.showsIndicator,
      deferredUpdatesDistance: optionalNumber(form.deferredDistance),
      deferredUpdatesTimeout: optionalNumber(form.deferredTimeout),
      deferredUpdatesInterval: optionalNumber(form.deferredInterval),
      activityType: form.activityType,
      pausesUpdatesAutomatically: form.pausesAutomatically,
      foregroundService: form.isForegroundService
        ? {
            notificationTitle: form.notificationTitle,
            notificationBody: form.notificationBody,
            notificationColor: form.notificationColor === '' ? undefined : form.notificationColor,
            killServiceOnDestroy: form.killServiceOnDestroy,
          }
        : undefined,
    };
  }

  function toRegion(): ILocationRegion {
    return {
      identifier,
      latitude: Number(latitude),
      longitude: Number(longitude),
      radius: Number(radius),
      notifyOnEnter,
      notifyOnExit,
    };
  }
</script>

<Card testID="location-task-card" title="Background task options">
  <ToggleRow testID="location-indicator-switch" label="showsBackgroundLocationIndicator (iOS)" value={form.showsIndicator} onChange={showsIndicator => (form.showsIndicator = showsIndicator)} {color} />
  <Field testID="location-deferred-distance-input" label="deferredUpdatesDistance (iOS)" value={form.deferredDistance} onChange={deferredDistance => (form.deferredDistance = deferredDistance)} />
  <Field testID="location-deferred-timeout-input" label="deferredUpdatesTimeout (iOS)" value={form.deferredTimeout} onChange={deferredTimeout => (form.deferredTimeout = deferredTimeout)} />
  <Field testID="location-deferred-interval-input" label="deferredUpdatesInterval (Android)" value={form.deferredInterval} onChange={deferredInterval => (form.deferredInterval = deferredInterval)} />
  <ChoiceRow testID="location-activity-type" label="activityType (iOS)" options={ACTIVITY_TYPES} value={form.activityType} onChange={activityType => (form.activityType = activityType)} {color} />
  <ToggleRow testID="location-pauses-switch" label="pausesUpdatesAutomatically (iOS)" value={form.pausesAutomatically} onChange={pausesAutomatically => (form.pausesAutomatically = pausesAutomatically)} {color} />
  <ToggleRow testID="location-foreground-service-toggle" label="foregroundService (Android)" value={form.isForegroundService} onChange={isForegroundService => (form.isForegroundService = isForegroundService)} {color} />
  <Field testID="location-notification-title-input" label="notificationTitle" value={form.notificationTitle} onChange={notificationTitle => (form.notificationTitle = notificationTitle)} />
  <Field testID="location-notification-body-input" label="notificationBody" value={form.notificationBody} onChange={notificationBody => (form.notificationBody = notificationBody)} />
  <Field testID="location-notification-color-input" label="notificationColor" value={form.notificationColor} onChange={notificationColor => (form.notificationColor = notificationColor)} />
  <ToggleRow testID="location-kill-switch" label="killServiceOnDestroy" value={form.killServiceOnDestroy} onChange={killServiceOnDestroy => (form.killServiceOnDestroy = killServiceOnDestroy)} {color} />
</Card>
<CallConsole
  prefix="location-background-calls"
  title="Background location updates"
  {color}
  hint="The foreground service option needs FOREGROUND_SERVICE and FOREGROUND_SERVICE_LOCATION in the app manifest, without them Android rejects the start."
  calls={[
    {
      label: 'isBackgroundLocationAvailableAsync',
      run: () => isBackgroundLocationAvailableAsync(),
    },
    {
      label: 'startLocationUpdatesAsync',
      run: () => startLocationUpdatesAsync(UPDATES_TASK, toTaskOptions()),
    },
    {
      label: 'hasStartedLocationUpdatesAsync',
      run: () => hasStartedLocationUpdatesAsync(UPDATES_TASK),
    },
    { label: 'stopLocationUpdatesAsync', run: () => stopLocationUpdatesAsync(UPDATES_TASK) },
  ]}
/>
<Card testID="location-geofence-card" title="Geofencing region">
  <Field testID="location-region-id-input" label="identifier" value={identifier} onChange={next => (identifier = next)} />
  <Field testID="location-region-lat-input" label="latitude" value={latitude} onChange={next => (latitude = next)} />
  <Field testID="location-region-lon-input" label="longitude" value={longitude} onChange={next => (longitude = next)} />
  <Field testID="location-region-radius-input" label="radius (meters)" value={radius} onChange={next => (radius = next)} />
  <ToggleRow testID="location-region-enter-switch" label="notifyOnEnter" value={notifyOnEnter} onChange={next => (notifyOnEnter = next)} {color} />
  <ToggleRow testID="location-region-exit-switch" label="notifyOnExit" value={notifyOnExit} onChange={next => (notifyOnExit = next)} {color} />
</Card>
<CallConsole
  prefix="location-geofencing-calls"
  title="Geofencing"
  {color}
  hint={`Events carry a GeofencingEventType (${GeofencingEventType.Enter} enter, ${GeofencingEventType.Exit} exit) and a GeofencingRegionState (${GeofencingRegionState.Unknown} unknown, ${GeofencingRegionState.Inside} inside, ${GeofencingRegionState.Outside} outside), logged when DEBUG is on. Needs the background permission.`}
  calls={[
    { label: 'startGeofencingAsync', run: () => startGeofencingAsync(GEOFENCING_TASK, [toRegion()]) },
    { label: 'hasStartedGeofencingAsync', run: () => hasStartedGeofencingAsync(GEOFENCING_TASK) },
    { label: 'stopGeofencingAsync', run: () => stopGeofencingAsync(GEOFENCING_TASK) },
  ]}
/>
