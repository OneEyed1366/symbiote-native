import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import {} from '@symbiote-native/vue';
import {
  MotionActivityConfidence,
  geocodeAsync,
  getBackgroundPermissionsAsync,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  getHeadingAsync,
  getMotionActivityAsync,
  getMotionActivityPermissionsAsync,
  hasStartedLocationUpdatesAsync,
  requestBackgroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  requestMotionActivityPermissionsAsync,
  reverseGeocodeAsync,
  startLocationUpdatesAsync,
  stopLocationUpdatesAsync,
  watchPositionAsync,
} from '@symbiote-native/location';
import type {
  ILocationGeocodedAddress,
  ILocationGeocodedLocation,
  ILocationHeadingObject,
  ILocationObject,
  ILocationSubscription,
  IMotionActivityObject,
} from '@symbiote-native/location';
import { defineTask } from '@symbiote-native/task-manager';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// Registered at module scope, not inside the component — native can launch the app headlessly
// to run this, before anything mounts. See @symbiote-native/task-manager's README.
const BACKGROUND_LOCATION_TASK = 'expo-location-canary-demo';
defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('expo-location-canary-demo failed:', error);
    return;
  }
  console.log('expo-location-canary-demo received:', data);
});

const GEOCODE_ADDRESS = '221B Baker Street, London';

type ICapabilityStatus = 'checking' | 'yes' | 'no';
type IAsyncResult<T> =
  | { kind: 'success'; value: T }
  | { kind: 'error'; message: string }
  | null;
type IDetectedActivity = { type: string; confidence: MotionActivityConfidence };

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function statusLabel(status: ICapabilityStatus): string {
  if (status === 'checking') return 'CHECKING…';
  return status === 'yes' ? 'YES' : 'NO';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatNullableNumber(value: number | null, digits: number): string {
  return value === null ? '—' : value.toFixed(digits);
}

function activityLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function confidenceLabel(confidence: MotionActivityConfidence): string {
  switch (confidence) {
    case MotionActivityConfidence.Low:
      return 'Low';
    case MotionActivityConfidence.Medium:
      return 'Medium';
    case MotionActivityConfidence.High:
      return 'High';
    default:
      return 'Unknown';
  }
}

function detectedActivities(activity: IMotionActivityObject): IDetectedActivity[] {
  return Object.entries(activity.activities)
    .filter(([, state]) => state.detected)
    .map(([type, state]) => ({ type, confidence: state.confidence }));
}

function CapabilityRow(props: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  return (
    <view testID={props.testID} class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <view class={`auth-status-badge auth-status-badge-${props.status}`}>
        <text class="auth-status-text">{statusLabel(props.status)}</text>
      </view>
    </view>
  );
}

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <text class="auth-value-text">{props.value}</text>
    </view>
  );
}

function renderResultBox<T>(
  testID: string,
  result: IAsyncResult<T>,
  renderSuccess: (value: T) => unknown,
) {
  if (result === null) return null;
  if (result.kind === 'error') {
    return (
      <view testID={testID} class="auth-result auth-result-error">
        <text class="auth-result-text">{`Failed: ${result.message}`}</text>
      </view>
    );
  }
  return (
    <view testID={testID} class="auth-result auth-result-success">
      {renderSuccess(result.value)}
    </view>
  );
}

function renderPositionFields(location: ILocationObject) {
  const { coords } = location;
  return [
    <ValueRow label="Latitude" value={coords.latitude.toFixed(6)} />,
    <ValueRow label="Longitude" value={coords.longitude.toFixed(6)} />,
    <ValueRow label="Altitude" value={formatNullableNumber(coords.altitude, 1)} />,
    <ValueRow label="Accuracy" value={formatNullableNumber(coords.accuracy, 1)} />,
    <ValueRow
      label="Altitude accuracy"
      value={formatNullableNumber(coords.altitudeAccuracy, 1)}
    />,
    <ValueRow label="Heading" value={formatNullableNumber(coords.heading, 1)} />,
    <ValueRow label="Speed" value={formatNullableNumber(coords.speed, 2)} />,
    <ValueRow
      label="Timestamp"
      value={new Date(location.timestamp).toLocaleTimeString()}
    />,
  ];
}

function renderHeadingFields(heading: ILocationHeadingObject) {
  return [
    <ValueRow label="True heading" value={heading.trueHeading.toFixed(1)} />,
    <ValueRow label="Magnetic heading" value={heading.magHeading.toFixed(1)} />,
    <ValueRow label="Accuracy" value={String(heading.accuracy)} />,
  ];
}

function renderActivityFields(detected: IDetectedActivity[]) {
  if (detected.length === 0)
    return <text class="auth-result-text">No activity detected</text>;
  return detected.map(activity => (
    <ValueRow
      label={activityLabel(activity.type)}
      value={confidenceLabel(activity.confidence)}
    />
  ));
}

function renderGeocodeFields(location: ILocationGeocodedLocation) {
  return [
    <ValueRow label="Latitude" value={location.latitude.toFixed(6)} />,
    <ValueRow label="Longitude" value={location.longitude.toFixed(6)} />,
  ];
}

function renderReverseGeocodeFields(address: ILocationGeocodedAddress) {
  return [
    <ValueRow label="City" value={address.city ?? '—'} />,
    <ValueRow label="Country" value={address.country ?? '—'} />,
    <ValueRow
      label="Formatted address"
      value={address.formattedAddress ?? '—'}
    />,
  ];
}

/**
 * Location demo: @symbiote-native/location — foreground/background position, heading, geocoding,
 * and motion activity. No Vue-specific wrapper exists yet, so every call below hits the plain
 * async core API directly. The background-location task is registered at module scope (see
 * @symbiote-native/task-manager's README) since native can invoke it headlessly.
 *
 * The "Foreground service" toggle passes `foregroundService` to startLocationUpdatesAsync, which
 * on Android promotes the task to a real foreground service (a persistent notification, exempt
 * from Doze) instead of a plain background task. That needs FOREGROUND_SERVICE and
 * FOREGROUND_SERVICE_LOCATION declared in the app's own AndroidManifest.xml — this canary's
 * native-link.json deliberately leaves @symbiote-native/location's own
 * isAndroidForegroundServiceEnabled unset (see its README), so on Android a start with the toggle
 * on is expected to reject with a SecurityException, not a bug either.
 */
export const LocationScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Location];
    const lineColor = LINE_COLOR[lineInfo.line];

    const foregroundStatus = ref<ICapabilityStatus>('checking');
    const backgroundStatus = ref<ICapabilityStatus>('checking');
    const motionStatus = ref<ICapabilityStatus>('checking');
    const isBackgroundRegistered = ref<ICapabilityStatus>('checking');

    const positionResult: Ref<IAsyncResult<ILocationObject>> = ref(null);
    const lastPosition: Ref<ILocationObject | null> = ref(null);
    const isWatching = ref(false);
    let watchSubscription: ILocationSubscription | null = null;

    const headingResult: Ref<IAsyncResult<ILocationHeadingObject>> = ref(null);
    const activityResult: Ref<IAsyncResult<IDetectedActivity[]>> = ref(null);
    const geocodeResult: Ref<IAsyncResult<ILocationGeocodedLocation>> = ref(null);
    const reverseGeocodeResult: Ref<IAsyncResult<ILocationGeocodedAddress>> =
      ref(null);
    const backgroundActionResult: Ref<IAsyncResult<string>> = ref(null);
    const useForegroundService = ref(false);

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
      watchSubscription?.remove();
    });

    async function refreshBackgroundRegisteredStatus() {
      try {
        const registered =
          await hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (isMounted) isBackgroundRegistered.value = toCapabilityStatus(registered);
      } catch {
        if (isMounted) isBackgroundRegistered.value = 'no';
      }
    }

    onMounted(() => {
      getForegroundPermissionsAsync().then(result => {
        if (isMounted) foregroundStatus.value = toCapabilityStatus(result.granted);
      });
      getBackgroundPermissionsAsync()
        .then(result => {
          if (isMounted) backgroundStatus.value = toCapabilityStatus(result.granted);
        })
        .catch(() => {
          if (isMounted) backgroundStatus.value = 'no';
        });
      getMotionActivityPermissionsAsync().then(result => {
        if (isMounted) motionStatus.value = toCapabilityStatus(result.granted);
      });
      refreshBackgroundRegisteredStatus();
    });

    async function handleRequestForeground() {
      const result = await requestForegroundPermissionsAsync();
      foregroundStatus.value = toCapabilityStatus(result.granted);
    }

    async function handleRequestBackground() {
      try {
        const result = await requestBackgroundPermissionsAsync();
        backgroundStatus.value = toCapabilityStatus(result.granted);
      } catch {
        backgroundStatus.value = 'no';
      }
    }

    async function handleRequestMotion() {
      const result = await requestMotionActivityPermissionsAsync();
      motionStatus.value = toCapabilityStatus(result.granted);
    }

    async function handleGetPosition() {
      try {
        const location = await getCurrentPositionAsync();
        lastPosition.value = location;
        positionResult.value = { kind: 'success', value: location };
      } catch (error) {
        positionResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }

    async function handleToggleWatch() {
      if (isWatching.value) {
        watchSubscription?.remove();
        watchSubscription = null;
        isWatching.value = false;
        return;
      }
      try {
        watchSubscription = await watchPositionAsync(
          {},
          location => {
            lastPosition.value = location;
            positionResult.value = { kind: 'success', value: location };
          },
          message => {
            positionResult.value = { kind: 'error', message };
          },
        );
        isWatching.value = true;
      } catch (error) {
        positionResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }

    async function handleGetHeading() {
      try {
        const heading = await getHeadingAsync();
        headingResult.value = { kind: 'success', value: heading };
      } catch (error) {
        headingResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }

    async function handleGetActivity() {
      try {
        const activity = await getMotionActivityAsync();
        activityResult.value = {
          kind: 'success',
          value: detectedActivities(activity),
        };
      } catch (error) {
        activityResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }

    async function handleGeocode() {
      try {
        const [first] = await geocodeAsync(GEOCODE_ADDRESS);
        if (!first) {
          geocodeResult.value = { kind: 'error', message: 'no results' };
          return;
        }
        geocodeResult.value = { kind: 'success', value: first };
      } catch (error) {
        geocodeResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }

    async function handleReverseGeocode() {
      if (!lastPosition.value) {
        reverseGeocodeResult.value = {
          kind: 'error',
          message: 'get a position first',
        };
        return;
      }
      try {
        const [first] = await reverseGeocodeAsync(lastPosition.value.coords);
        if (!first) {
          reverseGeocodeResult.value = { kind: 'error', message: 'no results' };
          return;
        }
        reverseGeocodeResult.value = { kind: 'success', value: first };
      } catch (error) {
        reverseGeocodeResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
    }

    async function handleStartBackground() {
      try {
        await startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          distanceInterval: 100,
          ...(useForegroundService.value
            ? {
                foregroundService: {
                  notificationTitle: 'Location canary',
                  notificationBody: 'Tracking your position in the background.',
                },
              }
            : {}),
        });
        backgroundActionResult.value = { kind: 'success', value: 'started' };
      } catch (error) {
        backgroundActionResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
      refreshBackgroundRegisteredStatus();
    }

    async function handleStopBackground() {
      try {
        await stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        backgroundActionResult.value = { kind: 'success', value: 'stopped' };
      } catch (error) {
        backgroundActionResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
      refreshBackgroundRegisteredStatus();
    }

    const watchToggleLabel = computed(() =>
      isWatching.value ? 'Stop watching' : 'Start watching',
    );

    return () => (
      <safe-area-view class="screen">
        <scroll-view
          testID="location-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
          </view>
          <view class="hero-card">
            <view class="hero-badge" style={{ backgroundColor: lineColor }}>
              <text class="hero-badge-text">{lineInfo.code}</text>
            </view>
            <view class="hero-copy">
              <text class="hero-title">Location</text>
              <text class="hero-body">
                @symbiote-native/location — foreground/background position,
                heading, geocoding, and motion activity. iOS Simulator has no
                real GPS but supports simulated location (Features →
                Location); Android emulator location is set via Extended
                Controls → Location.
              </text>
            </view>
          </view>

          <view testID="location-permissions-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Permissions</text>
            </view>
            <CapabilityRow
              testID="location-foreground-row"
              label="Foreground"
              status={foregroundStatus.value}
            />
            <ActionButton
              testID="location-request-foreground-button"
              title="Request foreground"
              onPress={handleRequestForeground}
              color={lineColor}
            />
            <CapabilityRow
              testID="location-background-row"
              label="Background"
              status={backgroundStatus.value}
            />
            <ActionButton
              testID="location-request-background-button"
              title="Request background"
              onPress={handleRequestBackground}
              color={lineColor}
            />
            <CapabilityRow
              testID="location-motion-row"
              label="Motion"
              status={motionStatus.value}
            />
            <ActionButton
              testID="location-request-motion-button"
              title="Request motion"
              onPress={handleRequestMotion}
              color={lineColor}
            />
          </view>

          <view testID="location-position-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Position</text>
            </view>
            <ActionButton
              testID="location-get-position-button"
              title="Get current position"
              onPress={handleGetPosition}
              color={lineColor}
            />
            <view class="auth-capability-row">
              <text class="auth-capability-label">Watch</text>
              <view
                testID="location-watching-status"
                class={`auth-status-badge auth-status-badge-${isWatching.value ? 'yes' : 'no'}`}
              >
                <text class="auth-status-text">
                  {isWatching.value ? 'WATCHING' : 'NOT WATCHING'}
                </text>
              </view>
            </view>
            <ActionButton
              testID="location-watch-toggle-button"
              title={watchToggleLabel.value}
              onPress={handleToggleWatch}
              color={lineColor}
            />
            {renderResultBox(
              'location-position-result',
              positionResult.value,
              renderPositionFields,
            )}
          </view>

          <view testID="location-heading-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Heading</text>
            </view>
            <ActionButton
              testID="location-get-heading-button"
              title="Get heading"
              onPress={handleGetHeading}
              color={lineColor}
            />
            {renderResultBox(
              'location-heading-result',
              headingResult.value,
              renderHeadingFields,
            )}
          </view>

          <view testID="location-activity-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Motion activity</text>
            </view>
            <ActionButton
              testID="location-get-activity-button"
              title="Get current activity"
              onPress={handleGetActivity}
              color={lineColor}
            />
            {renderResultBox(
              'location-activity-result',
              activityResult.value,
              renderActivityFields,
            )}
          </view>

          <view testID="location-geocode-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Geocoding</text>
            </view>
            <ValueRow label="Address" value={GEOCODE_ADDRESS} />
            <ActionButton
              testID="location-geocode-button"
              title="Geocode address"
              onPress={handleGeocode}
              color={lineColor}
            />
            {renderResultBox(
              'location-geocode-result',
              geocodeResult.value,
              renderGeocodeFields,
            )}
            <ActionButton
              testID="location-reverse-geocode-button"
              title="Reverse geocode last position"
              onPress={handleReverseGeocode}
              color={lineColor}
            />
            {renderResultBox(
              'location-reverse-geocode-result',
              reverseGeocodeResult.value,
              renderReverseGeocodeFields,
            )}
          </view>

          <view testID="location-background-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Background location</text>
            </view>
            <text class="info-text">
              Requires the background-location permission, which this demo
              does not request — Start likely rejects unless it was granted
              elsewhere.
            </text>
            <view class="auth-capability-row">
              <text class="auth-capability-label">Registered</text>
              <view
                testID="location-background-registered-status"
                class={`auth-status-badge auth-status-badge-${isBackgroundRegistered.value}`}
              >
                <text class="auth-status-text">
                  {statusLabel(isBackgroundRegistered.value)}
                </text>
              </view>
            </view>
            <view class="auth-capability-row">
              <text class="auth-capability-label">Foreground service</text>
              <view
                testID="location-foreground-service-status"
                class={`auth-status-badge auth-status-badge-${useForegroundService.value ? 'yes' : 'no'}`}
              >
                <text class="auth-status-text">
                  {useForegroundService.value ? 'ON' : 'OFF'}
                </text>
              </view>
            </view>
            <ActionButton
              testID="location-foreground-service-toggle"
              title={useForegroundService.value ? 'Turn off' : 'Turn on'}
              onPress={() => {
                useForegroundService.value = !useForegroundService.value;
              }}
              color={lineColor}
            />
            <ActionButton
              testID="location-start-background-button"
              title="Start"
              onPress={handleStartBackground}
              color={lineColor}
            />
            <ActionButton
              testID="location-stop-background-button"
              title="Stop"
              onPress={handleStopBackground}
              color={lineColor}
            />
            {renderResultBox(
              'location-background-result',
              backgroundActionResult.value,
              message => <text class="auth-result-text">{message}</text>,
            )}
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'LocationScreen' },
);
