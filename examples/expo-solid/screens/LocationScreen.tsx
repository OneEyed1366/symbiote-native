import { For, Show, createSignal, onCleanup, type Accessor } from 'solid-js';
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

const BACKGROUND_LOCATION_TASK = 'expo-location-canary-demo';
const GEOCODE_ADDRESS = '221B Baker Street, London';

// Must run at module top level, outside any component - the app can be launched headlessly to
// deliver a background location update, with no views mounted at all.
defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('expo-location-canary-demo failed:', error);
    return;
  }
  console.log('expo-location-canary-demo received:', data);
});

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function statusText(status: ICapabilityStatus): string {
  return status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatNullableNumber(value: number | null, unit: string): string {
  return value === null ? 'n/a' : `${value.toFixed(2)}${unit}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

function StatusBadge(props: { testID?: string; status: ICapabilityStatus }) {
  return (
    <view class={`status-badge status-badge-${props.status}`}>
      <text testID={props.testID} class="status-badge-text">
        {statusText(props.status)}
      </text>
    </view>
  );
}

function PermissionRow(props: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  return (
    <view testID={props.testID} class="capability-row">
      <text class="capability-label">{props.label}</text>
      <StatusBadge status={props.status} />
    </view>
  );
}

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text class="value-text">{props.value}</text>
    </view>
  );
}

function ErrorRow(props: { message: string }) {
  return <ValueRow label="Error" value={props.message} />;
}

/**
 * @symbiote-native/location canary demo: foreground/background/motion permission rows, a
 * one-shot + watched position card, heading, motion activity, forward/reverse geocoding, and a
 * background-location task registered via @symbiote-native/task-manager's defineTask. The iOS
 * Simulator has no real GPS but supports simulated location (Features -> Location); the Android
 * emulator's is set via Extended Controls -> Location. startLocationUpdatesAsync/background
 * permission calls may legitimately reject with no background-location permission requested by
 * this demo - shown inline as an error, not a bug.
 *
 * The "Foreground service" toggle passes `foregroundService` to startLocationUpdatesAsync, which
 * on Android promotes the task to a real foreground service (a persistent notification, exempt
 * from Doze) instead of a plain background task. That needs FOREGROUND_SERVICE and
 * FOREGROUND_SERVICE_LOCATION declared in the app's own AndroidManifest.xml — this canary's
 * native-link.json deliberately leaves @symbiote-native/location's own
 * isAndroidForegroundServiceEnabled unset (see its README), so on Android a start with the toggle
 * on is expected to reject with a SecurityException too, shown the same inline way.
 */
export function LocationScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Location];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [foregroundStatus, setForegroundStatus] =
    createSignal<ICapabilityStatus>('checking');
  const [backgroundStatus, setBackgroundStatus] =
    createSignal<ICapabilityStatus>('checking');
  const [motionStatus, setMotionStatus] =
    createSignal<ICapabilityStatus>('checking');

  const [position, setPosition] = createSignal<ILocationObject | null>(null);
  const [positionError, setPositionError] = createSignal<string | null>(null);
  const [isWatching, setIsWatching] = createSignal(false);

  const [heading, setHeading] = createSignal<ILocationHeadingObject | null>(
    null,
  );
  const [headingError, setHeadingError] = createSignal<string | null>(null);

  const [activity, setActivity] = createSignal<IMotionActivityObject | null>(
    null,
  );
  const [activityError, setActivityError] = createSignal<string | null>(null);
  const detectedActivities = () =>
    Object.entries(activity()?.activities ?? {}).filter(
      ([, state]) => state.detected,
    );

  const [geocodeResult, setGeocodeResult] =
    createSignal<ILocationGeocodedLocation | null>(null);
  const [geocodeError, setGeocodeError] = createSignal<string | null>(null);
  const [reverseGeocodeResult, setReverseGeocodeResult] =
    createSignal<ILocationGeocodedAddress | null>(null);
  const [reverseGeocodeError, setReverseGeocodeError] = createSignal<
    string | null
  >(null);

  const [backgroundRegistered, setBackgroundRegistered] =
    createSignal<ICapabilityStatus>('checking');
  const [backgroundMessage, setBackgroundMessage] = createSignal<string | null>(
    null,
  );
  const [useForegroundService, setUseForegroundService] = createSignal(false);

  let disposed = false;
  let watchSubscription: ILocationSubscription | null = null;
  onCleanup(() => {
    disposed = true;
    watchSubscription?.remove();
    watchSubscription = null;
  });

  getForegroundPermissionsAsync().then(result => {
    if (!disposed) {
      setForegroundStatus(toCapabilityStatus(result.granted));
    }
  });
  getBackgroundPermissionsAsync().then(result => {
    if (!disposed) {
      setBackgroundStatus(toCapabilityStatus(result.granted));
    }
  });
  getMotionActivityPermissionsAsync().then(result => {
    if (!disposed) {
      setMotionStatus(toCapabilityStatus(result.granted));
    }
  });

  const refreshBackgroundRegistered = () => {
    hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).then(started => {
      if (!disposed) {
        setBackgroundRegistered(toCapabilityStatus(started));
      }
    });
  };
  refreshBackgroundRegistered();

  const handleRequestForeground = () => {
    requestForegroundPermissionsAsync().then(result =>
      setForegroundStatus(toCapabilityStatus(result.granted)),
    );
  };
  const handleRequestBackground = () => {
    requestBackgroundPermissionsAsync().then(result =>
      setBackgroundStatus(toCapabilityStatus(result.granted)),
    );
  };
  const handleRequestMotion = () => {
    requestMotionActivityPermissionsAsync().then(result =>
      setMotionStatus(toCapabilityStatus(result.granted)),
    );
  };

  const handleGetPosition = async () => {
    try {
      const result = await getCurrentPositionAsync();
      setPositionError(null);
      setPosition(result);
    } catch (error) {
      setPositionError(errorMessage(error));
    }
  };

  const handleToggleWatch = async () => {
    if (isWatching()) {
      watchSubscription?.remove();
      watchSubscription = null;
      setIsWatching(false);
      return;
    }
    try {
      const subscription = await watchPositionAsync(
        {},
        location => {
          if (!disposed) {
            setPositionError(null);
            setPosition(location);
          }
        },
        reason => {
          if (!disposed) {
            setPositionError(reason);
          }
        },
      );
      if (disposed) {
        subscription.remove();
        return;
      }
      watchSubscription = subscription;
      setIsWatching(true);
    } catch (error) {
      setPositionError(errorMessage(error));
    }
  };

  const handleGetHeading = async () => {
    try {
      const result = await getHeadingAsync();
      setHeadingError(null);
      setHeading(result);
    } catch (error) {
      setHeadingError(errorMessage(error));
    }
  };

  const handleGetActivity = async () => {
    try {
      const result = await getMotionActivityAsync();
      setActivityError(null);
      setActivity(result);
    } catch (error) {
      setActivityError(errorMessage(error));
    }
  };

  const handleGeocode = async () => {
    try {
      const results = await geocodeAsync(GEOCODE_ADDRESS);
      setGeocodeError(null);
      setGeocodeResult(results[0] ?? null);
    } catch (error) {
      setGeocodeResult(null);
      setGeocodeError(errorMessage(error));
    }
  };

  const handleReverseGeocode = async () => {
    const current = position();
    if (!current) {
      setReverseGeocodeResult(null);
      setReverseGeocodeError(
        'no position fetched yet — use "Get current position" first',
      );
      return;
    }
    try {
      const results = await reverseGeocodeAsync(current.coords);
      setReverseGeocodeError(null);
      setReverseGeocodeResult(results[0] ?? null);
    } catch (error) {
      setReverseGeocodeResult(null);
      setReverseGeocodeError(errorMessage(error));
    }
  };

  const handleStartBackground = async () => {
    try {
      await startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        distanceInterval: 100,
        ...(useForegroundService()
          ? {
              foregroundService: {
                notificationTitle: 'Location canary',
                notificationBody: 'Tracking your position in the background.',
              },
            }
          : {}),
      });
      setBackgroundMessage(null);
    } catch (error) {
      setBackgroundMessage(errorMessage(error));
    }
    refreshBackgroundRegistered();
  };

  const handleStopBackground = async () => {
    try {
      await stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      setBackgroundMessage(null);
    } catch (error) {
      setBackgroundMessage(errorMessage(error));
    }
    refreshBackgroundRegistered();
  };

  return (
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
              heading, geocoding, and motion activity. iOS Simulator has no real
              GPS but supports simulated location (Features → Location); Android
              emulator location is set via Extended Controls → Location.
            </text>
          </view>
        </view>

        <view testID="location-permissions-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Permissions</text>
          </view>
          <PermissionRow
            testID="location-foreground-row"
            label="Foreground"
            status={foregroundStatus()}
          />
          <ActionButton
            testID="location-request-foreground-button"
            title="Request"
            onPress={handleRequestForeground}
            color={lineColor}
          />
          <PermissionRow
            testID="location-background-row"
            label="Background"
            status={backgroundStatus()}
          />
          <ActionButton
            testID="location-request-background-button"
            title="Request"
            onPress={handleRequestBackground}
            color={lineColor}
          />
          <PermissionRow
            testID="location-motion-row"
            label="Motion"
            status={motionStatus()}
          />
          <ActionButton
            testID="location-request-motion-button"
            title="Request"
            onPress={handleRequestMotion}
            color={lineColor}
          />
        </view>

        <view testID="location-position-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Position</text>
          </view>
          <ActionButton
            testID="location-get-position-button"
            title="Get current position"
            onPress={handleGetPosition}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Watch</text>
            <StatusBadge
              testID="location-watching-status"
              status={isWatching() ? 'yes' : 'no'}
            />
          </view>
          <ActionButton
            testID="location-watch-toggle-button"
            title={isWatching() ? 'Stop watching' : 'Start watching'}
            onPress={handleToggleWatch}
            color={lineColor}
          />
          <Show when={position() !== null || positionError() !== null}>
            <view testID="location-position-result">
              <Show when={positionError()}>
                {(message: Accessor<string>) => (
                  <ErrorRow message={message()} />
                )}
              </Show>
              <Show when={position()}>
                {(location: Accessor<ILocationObject>) => (
                  <>
                    <ValueRow
                      label="Latitude"
                      value={location().coords.latitude.toFixed(6)}
                    />
                    <ValueRow
                      label="Longitude"
                      value={location().coords.longitude.toFixed(6)}
                    />
                    <ValueRow
                      label="Altitude"
                      value={formatNullableNumber(
                        location().coords.altitude,
                        'm',
                      )}
                    />
                    <ValueRow
                      label="Accuracy"
                      value={formatNullableNumber(
                        location().coords.accuracy,
                        'm',
                      )}
                    />
                    <ValueRow
                      label="Heading"
                      value={formatNullableNumber(
                        location().coords.heading,
                        '°',
                      )}
                    />
                    <ValueRow
                      label="Speed"
                      value={formatNullableNumber(
                        location().coords.speed,
                        'm/s',
                      )}
                    />
                    <ValueRow
                      label="Timestamp"
                      value={new Date(
                        location().timestamp,
                      ).toLocaleTimeString()}
                    />
                  </>
                )}
              </Show>
            </view>
          </Show>
        </view>

        <view testID="location-heading-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Heading</text>
          </view>
          <ActionButton
            testID="location-get-heading-button"
            title="Get heading"
            onPress={handleGetHeading}
            color={lineColor}
          />
          <Show when={heading() !== null || headingError() !== null}>
            <view testID="location-heading-result">
              <Show when={headingError()}>
                {(message: Accessor<string>) => (
                  <ErrorRow message={message()} />
                )}
              </Show>
              <Show when={heading()}>
                {(value: Accessor<ILocationHeadingObject>) => (
                  <>
                    <ValueRow
                      label="True heading"
                      value={`${value().trueHeading.toFixed(1)}°`}
                    />
                    <ValueRow
                      label="Magnetic heading"
                      value={`${value().magHeading.toFixed(1)}°`}
                    />
                    <ValueRow label="Accuracy" value={`${value().accuracy}`} />
                  </>
                )}
              </Show>
            </view>
          </Show>
        </view>

        <view testID="location-activity-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Motion activity</text>
          </view>
          <ActionButton
            testID="location-get-activity-button"
            title="Get current activity"
            onPress={handleGetActivity}
            color={lineColor}
          />
          <Show when={activity() !== null || activityError() !== null}>
            <view testID="location-activity-result">
              <Show when={activityError()}>
                {(message: Accessor<string>) => (
                  <ErrorRow message={message()} />
                )}
              </Show>
              <Show when={activity()}>
                <Show
                  when={detectedActivities().length > 0}
                  fallback={<text class="info-text">no activity detected</text>}
                >
                  <For each={detectedActivities()}>
                    {([type, state]) => (
                      <ValueRow
                        label={capitalize(type)}
                        value={confidenceLabel(state.confidence)}
                      />
                    )}
                  </For>
                </Show>
              </Show>
            </view>
          </Show>
        </view>

        <view testID="location-geocode-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Geocoding</text>
          </view>
          <text class="info-text">{GEOCODE_ADDRESS}</text>
          <ActionButton
            testID="location-geocode-button"
            title="Geocode address"
            onPress={handleGeocode}
            color={lineColor}
          />
          <Show when={geocodeResult() !== null || geocodeError() !== null}>
            <view testID="location-geocode-result">
              <Show when={geocodeError()}>
                {(message: Accessor<string>) => (
                  <ErrorRow message={message()} />
                )}
              </Show>
              <Show when={geocodeResult()}>
                {(value: Accessor<ILocationGeocodedLocation>) => (
                  <>
                    <ValueRow
                      label="Latitude"
                      value={value().latitude.toFixed(6)}
                    />
                    <ValueRow
                      label="Longitude"
                      value={value().longitude.toFixed(6)}
                    />
                  </>
                )}
              </Show>
            </view>
          </Show>
          <ActionButton
            testID="location-reverse-geocode-button"
            title="Reverse geocode last position"
            onPress={handleReverseGeocode}
            color={lineColor}
          />
          <Show
            when={
              reverseGeocodeResult() !== null || reverseGeocodeError() !== null
            }
          >
            <view testID="location-reverse-geocode-result">
              <Show when={reverseGeocodeError()}>
                {(message: Accessor<string>) => (
                  <ErrorRow message={message()} />
                )}
              </Show>
              <Show when={reverseGeocodeResult()}>
                {(value: Accessor<ILocationGeocodedAddress>) => (
                  <>
                    <ValueRow label="City" value={value().city ?? 'unknown'} />
                    <ValueRow
                      label="Country"
                      value={value().country ?? 'unknown'}
                    />
                    <ValueRow
                      label="Address"
                      value={value().formattedAddress ?? 'unknown'}
                    />
                  </>
                )}
              </Show>
            </view>
          </Show>
        </view>

        <view testID="location-background-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Background location</text>
            <StatusBadge
              testID="location-background-registered-status"
              status={backgroundRegistered()}
            />
          </view>
          <text class="info-text">
            Registers {BACKGROUND_LOCATION_TASK} to keep receiving location
            updates while backgrounded. This demo does not request the
            background-location permission, so Start may legitimately reject.
          </text>
          <view class="capability-row">
            <text class="capability-label">Foreground service</text>
            <StatusBadge
              testID="location-foreground-service-status"
              status={useForegroundService() ? 'yes' : 'no'}
            />
          </view>
          <ActionButton
            testID="location-foreground-service-toggle"
            title={useForegroundService() ? 'Turn off' : 'Turn on'}
            onPress={() => setUseForegroundService(current => !current)}
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
          <Show when={backgroundMessage()}>
            {(message: Accessor<string>) => <ErrorRow message={message()} />}
          </Show>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
