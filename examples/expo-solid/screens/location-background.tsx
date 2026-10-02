import { createSignal } from 'solid-js';
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
} from '@symbiote-native/location/solid';
import type {
  ILocationRegion,
  ILocationTaskOptions,
} from '@symbiote-native/location/solid';
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

function TaskFields(props: { form: ITaskForm; setForm: ISetTask }) {
  return (
    <Card testID="location-task-card" title="Background task options">
      <ToggleRow testID="location-indicator-switch" label="showsBackgroundLocationIndicator (iOS)" value={props.form.showsIndicator} onChange={showsIndicator => props.setForm({ showsIndicator })} color={color} />
      <Field testID="location-deferred-distance-input" label="deferredUpdatesDistance (iOS)" value={props.form.deferredDistance} onChange={deferredDistance => props.setForm({ deferredDistance })} />
      <Field testID="location-deferred-timeout-input" label="deferredUpdatesTimeout (iOS)" value={props.form.deferredTimeout} onChange={deferredTimeout => props.setForm({ deferredTimeout })} />
      <Field testID="location-deferred-interval-input" label="deferredUpdatesInterval (Android)" value={props.form.deferredInterval} onChange={deferredInterval => props.setForm({ deferredInterval })} />
      <ChoiceRow testID="location-activity-type" label="activityType (iOS)" options={ACTIVITY_TYPES} value={props.form.activityType} onChange={activityType => props.setForm({ activityType })} color={color} />
      <ToggleRow testID="location-pauses-switch" label="pausesUpdatesAutomatically (iOS)" value={props.form.pausesAutomatically} onChange={pausesAutomatically => props.setForm({ pausesAutomatically })} color={color} />
      <ToggleRow testID="location-foreground-service-toggle" label="foregroundService (Android)" value={props.form.isForegroundService} onChange={isForegroundService => props.setForm({ isForegroundService })} color={color} />
      <Field testID="location-notification-title-input" label="notificationTitle" value={props.form.notificationTitle} onChange={notificationTitle => props.setForm({ notificationTitle })} />
      <Field testID="location-notification-body-input" label="notificationBody" value={props.form.notificationBody} onChange={notificationBody => props.setForm({ notificationBody })} />
      <Field testID="location-notification-color-input" label="notificationColor" value={props.form.notificationColor} onChange={notificationColor => props.setForm({ notificationColor })} />
      <ToggleRow testID="location-kill-switch" label="killServiceOnDestroy" value={props.form.killServiceOnDestroy} onChange={killServiceOnDestroy => props.setForm({ killServiceOnDestroy })} color={color} />
    </Card>
  );
}

export function BackgroundCards(props: { options: IOptionsForm }) {
  const [form, setFormState] = createSignal<ITaskForm>({
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
      <TaskFields form={form()} setForm={setForm} />
      <CallConsole
        prefix="location-background-calls"
        title="Background location updates"
        color={color}
        hint="The foreground service option needs FOREGROUND_SERVICE and FOREGROUND_SERVICE_LOCATION in the app manifest, without them Android rejects the start."
        calls={[
          { label: 'isBackgroundLocationAvailableAsync', run: () => isBackgroundLocationAvailableAsync() },
          {
            label: 'startLocationUpdatesAsync',
            run: () => startLocationUpdatesAsync(UPDATES_TASK, toTaskOptions(form(), props.options)),
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
  const [identifier, setIdentifier] = createSignal('canary-region');
  const [latitude, setLatitude] = createSignal('37.33');
  const [longitude, setLongitude] = createSignal('-122.03');
  const [radius, setRadius] = createSignal('200');
  const [notifyOnEnter, setNotifyOnEnter] = createSignal(true);
  const [notifyOnExit, setNotifyOnExit] = createSignal(true);

  const region = (): ILocationRegion => ({
    identifier: identifier(),
    latitude: Number(latitude()),
    longitude: Number(longitude()),
    radius: Number(radius()),
    notifyOnEnter: notifyOnEnter(),
    notifyOnExit: notifyOnExit(),
  });

  return (
    <>
      <Card testID="location-geofence-card" title="Geofencing region">
        <Field testID="location-region-id-input" label="identifier" value={identifier()} onChange={setIdentifier} />
        <Field testID="location-region-lat-input" label="latitude" value={latitude()} onChange={setLatitude} />
        <Field testID="location-region-lon-input" label="longitude" value={longitude()} onChange={setLongitude} />
        <Field testID="location-region-radius-input" label="radius (meters)" value={radius()} onChange={setRadius} />
        <ToggleRow testID="location-region-enter-switch" label="notifyOnEnter" value={notifyOnEnter()} onChange={setNotifyOnEnter} color={color} />
        <ToggleRow testID="location-region-exit-switch" label="notifyOnExit" value={notifyOnExit()} onChange={setNotifyOnExit} color={color} />
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
