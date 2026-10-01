import { defineComponent, onUnmounted, ref } from 'vue';
import {
  Accuracy,
  MotionActivityConfidence,
  enableNetworkProviderAsync,
  geocodeAsync,
  getBackgroundPermissionsAsync,
  getCurrentPositionAsync,
  getCurrentWatchId,
  getForegroundPermissionsAsync,
  getHeadingAsync,
  getLastKnownPositionAsync,
  getMotionActivityAsync,
  getMotionActivityPermissionsAsync,
  getProviderStatusAsync,
  hasServicesEnabledAsync,
  installWebGeolocationPolyfill,
  requestBackgroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  requestMotionActivityPermissionsAsync,
  reverseGeocodeAsync,
  useBackgroundPermissions,
  useForegroundPermissions,
  useMotionActivityPermissions,
  watchHeadingAsync,
  watchMotionActivityAsync,
  watchPositionAsync,
} from '@symbiote-native/location/vue';
import type {
  ILocationObject,
  ILocationOptions,
  ILocationSubscription,
} from '@symbiote-native/location/vue';
import { CallConsole } from '../components/CallConsole';
import { Scenario } from '../components/Scenario';
import {
  Card,
  ChoiceRow,
  Field,
  ResultRow,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Location);

export type IOptionsForm = {
  accuracy: Accuracy;
  mayShowUserSettingsDialog: boolean;
  timeInterval: string;
  distanceInterval: string;
  maxAge: string;
  requiredAccuracy: string;
};
export type ISetOptions = (patch: Partial<IOptionsForm>) => void;

export const INITIAL_OPTIONS: IOptionsForm = {
  accuracy: Accuracy.Balanced,
  mayShowUserSettingsDialog: true,
  timeInterval: '',
  distanceInterval: '1',
  maxAge: '',
  requiredAccuracy: '',
};

const ACCURACIES = [
  { label: 'Lowest', value: Accuracy.Lowest },
  { label: 'Low', value: Accuracy.Low },
  { label: 'Balanced', value: Accuracy.Balanced },
  { label: 'High', value: Accuracy.High },
  { label: 'Highest', value: Accuracy.Highest },
  { label: 'BestForNavigation', value: Accuracy.BestForNavigation },
] as const;

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

export function toLocationOptions(form: IOptionsForm): ILocationOptions {
  return {
    accuracy: form.accuracy,
    mayShowUserSettingsDialog: form.mayShowUserSettingsDialog,
    timeInterval: optionalNumber(form.timeInterval),
    distanceInterval: optionalNumber(form.distanceInterval),
  };
}

function permissionLabel(response: { status: string; granted: boolean } | null): string {
  return response === null ? 'loading…' : `${response.status}, granted ${response.granted}`;
}

export const PermissionCards = defineComponent(
  () => {
    const [foreground] = useForegroundPermissions();
    const [background] = useBackgroundPermissions();
    const [motion] = useMotionActivityPermissions();
    return () => (
      <>
        <Card testID="location-permissions-card" title="Permission hooks">
          <ResultRow testID="location-foreground-row" label="useForegroundPermissions" value={permissionLabel(foreground.value)} />
          <ResultRow testID="location-background-row" label="useBackgroundPermissions" value={permissionLabel(background.value)} />
          <ResultRow testID="location-motion-row" label="useMotionActivityPermissions" value={permissionLabel(motion.value)} />
        </Card>
        <CallConsole
          prefix="location-permission-calls"
          title="Permission calls"
          color={color}
          hint="Background permission needs the foreground one first, a rejection there can be expected on a simulator."
          calls={[
            { label: 'getForegroundPermissionsAsync', run: () => getForegroundPermissionsAsync() },
            { label: 'requestForegroundPermissionsAsync', run: () => requestForegroundPermissionsAsync() },
            { label: 'getBackgroundPermissionsAsync', run: () => getBackgroundPermissionsAsync() },
            { label: 'requestBackgroundPermissionsAsync', run: () => requestBackgroundPermissionsAsync() },
            { label: 'getMotionActivityPermissionsAsync', run: () => getMotionActivityPermissionsAsync() },
            { label: 'requestMotionActivityPermissionsAsync', run: () => requestMotionActivityPermissionsAsync() },
            { label: 'hasServicesEnabledAsync', run: () => hasServicesEnabledAsync() },
            { label: 'getProviderStatusAsync', run: () => getProviderStatusAsync() },
            { label: 'enableNetworkProviderAsync (Android)', run: () => enableNetworkProviderAsync() },
          ]}
        />
      </>
    );
  },
  { name: 'PermissionCards' },
);

export function OptionsCard(props: { form: IOptionsForm; setForm: ISetOptions }) {
  return (
    <Card testID="location-options-card" title="Position options">
      <ChoiceRow testID="location-accuracy" label="accuracy" options={ACCURACIES} value={props.form.accuracy} onChange={accuracy => props.setForm({ accuracy })} color={color} />
      <ToggleRow testID="location-dialog-switch" label="mayShowUserSettingsDialog (Android)" value={props.form.mayShowUserSettingsDialog} onChange={mayShowUserSettingsDialog => props.setForm({ mayShowUserSettingsDialog })} color={color} />
      <Field testID="location-time-input" label="timeInterval (ms, Android)" value={props.form.timeInterval} onChange={timeInterval => props.setForm({ timeInterval })} />
      <Field testID="location-distance-input" label="distanceInterval (meters)" value={props.form.distanceInterval} onChange={distanceInterval => props.setForm({ distanceInterval })} />
      <Field testID="location-max-age-input" label="maxAge (ms, last known)" value={props.form.maxAge} onChange={maxAge => props.setForm({ maxAge })} />
      <Field testID="location-required-accuracy-input" label="requiredAccuracy (meters, last known)" value={props.form.requiredAccuracy} onChange={requiredAccuracy => props.setForm({ requiredAccuracy })} />
    </Card>
  );
}

function describePosition(location: ILocationObject): string {
  const { coords } = location;
  return `lat ${coords.latitude.toFixed(5)}, lon ${coords.longitude.toFixed(5)}, accuracy ${coords.accuracy}, speed ${coords.speed}, heading ${coords.heading}, at ${new Date(location.timestamp).toISOString()}`;
}

type IStart = (
  onText: (text: string) => void,
  onError: (reason: string) => void,
) => Promise<ILocationSubscription>;

const WatchRow = defineComponent<{ prefix: string; label: string; start: IStart }>(
  props => {
    const isOn = ref(false);
    const output = ref('not watching');
    let subscription: ILocationSubscription | null = null;

    onUnmounted(() => subscription?.remove());

    const toggle = (next: boolean) => {
      if (!next) {
        subscription?.remove();
        subscription = null;
        isOn.value = false;
        return;
      }
      props
        .start(
          text => {
            output.value = text;
          },
          reason => {
            output.value = `error: ${reason}`;
          },
        )
        .then(sub => {
          subscription = sub;
          isOn.value = true;
        })
        .catch((error: Error) => {
          output.value = `failed: ${error.message}`;
        });
    };

    return () => (
      <>
        <ToggleRow testID={`${props.prefix}-switch`} label={props.label} value={isOn.value} onChange={toggle} color={color} />
        <ResultRow testID={`${props.prefix}-output`} label="latest" value={output.value} />
      </>
    );
  },
  { name: 'WatchRow', props: ['prefix', 'label', 'start'] },
);

function describeActivity(activity: { activities: Record<string, { detected: boolean; confidence: MotionActivityConfidence }> }): string {
  const detected = Object.entries(activity.activities).filter(([, state]) => state.detected);
  return detected.length === 0
    ? 'no activity detected'
    : detected.map(([type, state]) => `${type}: ${MotionActivityConfidence[state.confidence]}`).join(', ');
}

export const WatchCard = defineComponent<{ options: IOptionsForm }>(
  props => () => (
    <Scenario
      testID="location-watch-card"
      title="Follow the user as they move"
      why="Drive a live map, record a run or show distance to a destination. Watches push a new value whenever the position, compass heading or motion changes."
      steps={['Turn on watchPositionAsync', 'Move, or change the simulated location', 'Turn on the heading watch and rotate the phone']}
      expect="Each row updates in place with the newest coordinates, heading or activity. Turning the switch off stops the updates."
    >
      <WatchRow
        prefix="location-watch-position"
        label="watchPositionAsync"
        start={(onText, onError) => watchPositionAsync(toLocationOptions(props.options), position => onText(describePosition(position)), onError)}
      />
      <WatchRow
        prefix="location-watch-heading"
        label="watchHeadingAsync"
        start={(onText, onError) =>
          watchHeadingAsync(
            heading => onText(`true ${heading.trueHeading}, magnetic ${heading.magHeading}, accuracy ${heading.accuracy}`),
            onError,
          )
        }
      />
      <WatchRow
        prefix="location-watch-motion"
        label="watchMotionActivityAsync (iOS, foreground)"
        start={(onText, onError) => watchMotionActivityAsync(activity => onText(describeActivity(activity)), onError)}
      />
    </Scenario>
  ),
  { name: 'WatchCard', props: ['options'] },
);

export const OneShotCalls = defineComponent<{ options: IOptionsForm }>(
  props => {
    const address = ref('221B Baker Street, London');
    const last = ref<ILocationObject | null>(null);
    return () => (
      <Scenario
        testID="location-geocode-card"
        title="Find where the user is right now, and turn it into an address"
        why="Show nearby stores, prefill a delivery address or tag a photo. One call gives the current coordinates, and reverse geocoding turns them into a street address."
        steps={['Allow location in the permission card above', 'Press getCurrentPositionAsync (set a simulated location on a simulator)', 'Press reverseGeocodeAsync, then try geocodeAsync with an address']}
        expect="The first call prints latitude, longitude and accuracy. Reverse geocoding prints the matching street address, and geocodeAsync prints coordinates for the typed address."
      >
        <Field testID="location-address-input" label="address for geocodeAsync" value={address.value} onChange={next => { address.value = next; }} />
        <CallConsole
          isBare
          prefix="location-one-shot"
          title="One-shot calls"
          color={color}
          hint="The simulator has no GPS, set a simulated location (iOS: Features, Location; Android: Extended Controls)."
          calls={[
            {
              label: 'getCurrentPositionAsync',
              run: async () => {
                const position = await getCurrentPositionAsync(toLocationOptions(props.options));
                last.value = position;
                return describePosition(position);
              },
            },
            {
              label: 'getLastKnownPositionAsync',
              run: async () => {
                const position = await getLastKnownPositionAsync({
                  maxAge: optionalNumber(props.options.maxAge),
                  requiredAccuracy: optionalNumber(props.options.requiredAccuracy),
                });
                return position && describePosition(position);
              },
            },
            { label: 'getHeadingAsync', run: () => getHeadingAsync() },
            { label: 'getMotionActivityAsync (iOS)', run: async () => describeActivity(await getMotionActivityAsync()) },
            { label: 'geocodeAsync', run: () => geocodeAsync(address.value) },
            {
              label: 'reverseGeocodeAsync (last position)',
              run: () => {
                const position = last.value;
                if (position === null) {
                  throw new Error('get a position first');
                }
                return reverseGeocodeAsync(position.coords);
              },
            },
          ]}
        />
      </Scenario>
    );
  },
  { name: 'OneShotCalls', props: ['options'] },
);

export function PolyfillCard() {
  return (
    <CallConsole
      prefix="location-polyfill"
      title="Web geolocation polyfill"
      color={color}
      calls={[
        { label: 'installWebGeolocationPolyfill', run: async () => installWebGeolocationPolyfill() },
        { label: 'getCurrentWatchId', run: async () => getCurrentWatchId() },
      ]}
    />
  );
}
