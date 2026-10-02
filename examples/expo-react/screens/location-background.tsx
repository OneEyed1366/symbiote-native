import { useState } from 'react';
import {
  Accuracy,
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
} from '@symbiote-native/location';
import type {
  ILocationRegion,
  ILocationTaskOptions,
} from '@symbiote-native/location';
import { dlog } from '@symbiote-native/engine';
import { defineTask } from '@symbiote-native/task-manager';
import { CallConsole } from '../components/CallConsole';
import {
  Card,
  ChoiceRow,
  Field,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { toLocationOptions } from './location-cards';
import type { IOptionsForm } from './location-cards';

const color = lineColorOf(ROUTE_NAME.Location);
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
type ISetTask = (patch: Partial<ITaskForm>) => void;

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function toTaskOptions(form: ITaskForm, base: IOptionsForm): ILocationTaskOptions {
  return {
    ...toLocationOptions(base),
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

function TaskFields({ form, setForm }: { form: ITaskForm; setForm: ISetTask }) {
  return (
    <Card testID="location-task-card" title="Background task options">
      <ToggleRow testID="location-indicator-switch" label="showsBackgroundLocationIndicator (iOS)" value={form.showsIndicator} onChange={showsIndicator => setForm({ showsIndicator })} color={color} />
      <Field testID="location-deferred-distance-input" label="deferredUpdatesDistance (iOS)" value={form.deferredDistance} onChange={deferredDistance => setForm({ deferredDistance })} />
      <Field testID="location-deferred-timeout-input" label="deferredUpdatesTimeout (iOS)" value={form.deferredTimeout} onChange={deferredTimeout => setForm({ deferredTimeout })} />
      <Field testID="location-deferred-interval-input" label="deferredUpdatesInterval (Android)" value={form.deferredInterval} onChange={deferredInterval => setForm({ deferredInterval })} />
      <ChoiceRow testID="location-activity-type" label="activityType (iOS)" options={ACTIVITY_TYPES} value={form.activityType} onChange={activityType => setForm({ activityType })} color={color} />
      <ToggleRow testID="location-pauses-switch" label="pausesUpdatesAutomatically (iOS)" value={form.pausesAutomatically} onChange={pausesAutomatically => setForm({ pausesAutomatically })} color={color} />
      <ToggleRow testID="location-foreground-service-toggle" label="foregroundService (Android)" value={form.isForegroundService} onChange={isForegroundService => setForm({ isForegroundService })} color={color} />
      <Field testID="location-notification-title-input" label="notificationTitle" value={form.notificationTitle} onChange={notificationTitle => setForm({ notificationTitle })} />
      <Field testID="location-notification-body-input" label="notificationBody" value={form.notificationBody} onChange={notificationBody => setForm({ notificationBody })} />
      <Field testID="location-notification-color-input" label="notificationColor" value={form.notificationColor} onChange={notificationColor => setForm({ notificationColor })} />
      <ToggleRow testID="location-kill-switch" label="killServiceOnDestroy" value={form.killServiceOnDestroy} onChange={killServiceOnDestroy => setForm({ killServiceOnDestroy })} color={color} />
    </Card>
  );
}

export function BackgroundCards({ options }: { options: IOptionsForm }) {
  const [form, setFormState] = useState<ITaskForm>({
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
  const setForm: ISetTask = patch => setFormState(previous => ({ ...previous, ...patch }));

  return (
    <>
      <TaskFields form={form} setForm={setForm} />
      <CallConsole
        prefix="location-background-calls"
        title="Background location updates"
        color={color}
        hint="The foreground service option needs FOREGROUND_SERVICE and FOREGROUND_SERVICE_LOCATION in the app manifest, without them Android rejects the start."
        calls={[
          { label: 'isBackgroundLocationAvailableAsync', run: () => isBackgroundLocationAvailableAsync() },
          {
            label: 'startLocationUpdatesAsync',
            run: () => startLocationUpdatesAsync(UPDATES_TASK, toTaskOptions(form, options)),
          },
          { label: 'hasStartedLocationUpdatesAsync', run: () => hasStartedLocationUpdatesAsync(UPDATES_TASK) },
          { label: 'stopLocationUpdatesAsync', run: () => stopLocationUpdatesAsync(UPDATES_TASK) },
        ]}
      />
      <GeofencingCards />
    </>
  );
}

function GeofencingCards() {
  const [identifier, setIdentifier] = useState('canary-region');
  const [latitude, setLatitude] = useState('37.33');
  const [longitude, setLongitude] = useState('-122.03');
  const [radius, setRadius] = useState('200');
  const [notifyOnEnter, setNotifyOnEnter] = useState(true);
  const [notifyOnExit, setNotifyOnExit] = useState(true);

  const region = (): ILocationRegion => ({
    identifier,
    latitude: Number(latitude),
    longitude: Number(longitude),
    radius: Number(radius),
    notifyOnEnter,
    notifyOnExit,
  });

  return (
    <>
      <Card testID="location-geofence-card" title="Geofencing region">
        <Field testID="location-region-id-input" label="identifier" value={identifier} onChange={setIdentifier} />
        <Field testID="location-region-lat-input" label="latitude" value={latitude} onChange={setLatitude} />
        <Field testID="location-region-lon-input" label="longitude" value={longitude} onChange={setLongitude} />
        <Field testID="location-region-radius-input" label="radius (meters)" value={radius} onChange={setRadius} />
        <ToggleRow testID="location-region-enter-switch" label="notifyOnEnter" value={notifyOnEnter} onChange={setNotifyOnEnter} color={color} />
        <ToggleRow testID="location-region-exit-switch" label="notifyOnExit" value={notifyOnExit} onChange={setNotifyOnExit} color={color} />
      </Card>
      <CallConsole
        prefix="location-geofencing-calls"
        title="Geofencing"
        color={color}
        hint={`Events carry a GeofencingEventType (${GeofencingEventType.Enter} enter, ${GeofencingEventType.Exit} exit) and a GeofencingRegionState (${GeofencingRegionState.Unknown} unknown, ${GeofencingRegionState.Inside} inside, ${GeofencingRegionState.Outside} outside), logged when DEBUG is on. Needs the background permission.`}
        calls={[
          { label: 'startGeofencingAsync', run: () => startGeofencingAsync(GEOFENCING_TASK, [region()]) },
          { label: 'hasStartedGeofencingAsync', run: () => hasStartedGeofencingAsync(GEOFENCING_TASK) },
          { label: 'stopGeofencingAsync', run: () => stopGeofencingAsync(GEOFENCING_TASK) },
        ]}
      />
    </>
  );
}
