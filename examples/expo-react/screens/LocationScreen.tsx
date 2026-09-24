import { useCallback, useEffect, useRef, useState } from 'react';
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

// defineTask() must run at module top level — the app can be launched headlessly to run this
// task, so it can't depend on LocationScreen ever having mounted.
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type IAsyncResult<TValue> =
  | { status: 'success'; value: TValue }
  | { status: 'error'; message: string };

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

function formatNullable(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value);
}

function CapabilityBadge({ status }: { status: ICapabilityStatus }) {
  const label =
    status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  return (
    <view className={`auth-status-badge auth-status-badge-${status}`}>
      <text className="auth-status-text">{label}</text>
    </view>
  );
}

function CapabilityRow({
  testID,
  label,
  status,
  onRequest,
  requestTestID,
}: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
  onRequest: () => void;
  requestTestID: string;
}) {
  return (
    <view testID={testID} className="auth-capability-row">
      <text className="auth-capability-label">{label}</text>
      <view className="location-permission-actions">
        <CapabilityBadge status={status} />
        <ActionButton
          testID={requestTestID}
          title="Request"
          onPress={onRequest}
          color="#1d4ed8"
        />
      </view>
    </view>
  );
}

function ResultBlock({ testID, result }: { testID: string; result: IAsyncResult<string> | null }) {
  if (!result) {
    return null;
  }
  return (
    <view
      testID={testID}
      className={`auth-result auth-result-${result.status === 'success' ? 'success' : 'error'}`}
    >
      <text className="auth-result-text">
        {result.status === 'success' ? result.value : `Failed: ${result.message}`}
      </text>
    </view>
  );
}

/**
 * @symbiote-native/location canary demo: permissions (foreground/background/motion), one-shot +
 * watched position, heading, motion activity, geocoding/reverse-geocoding, and a background
 * location task registered through @symbiote-native/task-manager's defineTask. iOS Simulator has
 * no real GPS but supports simulated location (Features → Location); Android emulator location is
 * set via Extended Controls → Location. startLocationUpdatesAsync/background permissions may
 * legitimately reject on a device/simulator lacking the background-location permission — this
 * demo deliberately never requests it, so a rejection there is expected, not a bug.
 *
 * The "Foreground service" toggle passes `foregroundService` to startLocationUpdatesAsync, which
 * on Android promotes the task to a real foreground service (a persistent notification, exempt
 * from Doze) instead of a plain background task. That needs FOREGROUND_SERVICE and
 * FOREGROUND_SERVICE_LOCATION declared in the app's own AndroidManifest.xml — this canary's
 * native-link.json deliberately leaves @symbiote-native/location's own
 * isAndroidForegroundServiceEnabled unset (see its README), so on Android a start with the toggle
 * on is expected to reject with a SecurityException, not a bug either.
 */
export function LocationScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Location];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [foregroundStatus, setForegroundStatus] =
    useState<ICapabilityStatus>('checking');
  const [backgroundStatus, setBackgroundStatus] =
    useState<ICapabilityStatus>('checking');
  const [motionStatus, setMotionStatus] = useState<ICapabilityStatus>('checking');

  useEffect(() => {
    let isMounted = true;
    getForegroundPermissionsAsync().then(response => {
      if (isMounted) {
        setForegroundStatus(toCapabilityStatus(response.granted));
      }
    });
    getBackgroundPermissionsAsync().then(response => {
      if (isMounted) {
        setBackgroundStatus(toCapabilityStatus(response.granted));
      }
    });
    getMotionActivityPermissionsAsync().then(response => {
      if (isMounted) {
        setMotionStatus(toCapabilityStatus(response.granted));
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRequestForeground = useCallback(() => {
    requestForegroundPermissionsAsync()
      .then(response => setForegroundStatus(toCapabilityStatus(response.granted)))
      .catch(() => setForegroundStatus('no'));
  }, []);

  const handleRequestBackground = useCallback(() => {
    requestBackgroundPermissionsAsync()
      .then(response => setBackgroundStatus(toCapabilityStatus(response.granted)))
      .catch(() => setBackgroundStatus('no'));
  }, []);

  const handleRequestMotion = useCallback(() => {
    requestMotionActivityPermissionsAsync()
      .then(response => setMotionStatus(toCapabilityStatus(response.granted)))
      .catch(() => setMotionStatus('no'));
  }, []);

  const [lastPosition, setLastPosition] = useState<ILocationObject | null>(null);
  const [positionResult, setPositionResult] = useState<IAsyncResult<string> | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const watchSubscriptionRef = useRef<ILocationSubscription | null>(null);

  const describePosition = useCallback((location: ILocationObject): string => {
    const { coords } = location;
    return (
      `lat ${coords.latitude.toFixed(5)}, lon ${coords.longitude.toFixed(5)}\n` +
      `altitude: ${formatNullable(coords.altitude)}  accuracy: ${formatNullable(coords.accuracy)}\n` +
      `heading: ${formatNullable(coords.heading)}  speed: ${formatNullable(coords.speed)}\n` +
      `timestamp: ${new Date(location.timestamp).toISOString()}`
    );
  }, []);

  const handleGetPosition = useCallback(() => {
    getCurrentPositionAsync()
      .then(location => {
        setLastPosition(location);
        setPositionResult({ status: 'success', value: describePosition(location) });
      })
      .catch(error => setPositionResult({ status: 'error', message: errorMessage(error) }));
  }, [describePosition]);

  const handleToggleWatch = useCallback(() => {
    if (isWatching) {
      watchSubscriptionRef.current?.remove();
      watchSubscriptionRef.current = null;
      setIsWatching(false);
      return;
    }
    watchPositionAsync(
      { distanceInterval: 1 },
      location => {
        setLastPosition(location);
        setPositionResult({ status: 'success', value: describePosition(location) });
      },
      reason => setPositionResult({ status: 'error', message: reason }),
    )
      .then(subscription => {
        watchSubscriptionRef.current = subscription;
        setIsWatching(true);
      })
      .catch(error => setPositionResult({ status: 'error', message: errorMessage(error) }));
  }, [isWatching, describePosition]);

  useEffect(() => {
    return () => {
      watchSubscriptionRef.current?.remove();
    };
  }, []);

  const [headingResult, setHeadingResult] = useState<IAsyncResult<string> | null>(null);

  const handleGetHeading = useCallback(() => {
    getHeadingAsync()
      .then((heading: ILocationHeadingObject) =>
        setHeadingResult({
          status: 'success',
          value: `true ${heading.trueHeading}°  mag ${heading.magHeading}°  accuracy ${heading.accuracy}`,
        }),
      )
      .catch(error => setHeadingResult({ status: 'error', message: errorMessage(error) }));
  }, []);

  const [activityResult, setActivityResult] = useState<IAsyncResult<string> | null>(null);

  const handleGetActivity = useCallback(() => {
    getMotionActivityAsync()
      .then((activity: IMotionActivityObject) => {
        const detected = Object.entries(activity.activities).filter(
          ([, state]) => state.detected,
        );
        const summary =
          detected.length === 0
            ? 'no activity detected'
            : detected
                .map(([type, state]) => `${type}: ${confidenceLabel(state.confidence)}`)
                .join('\n');
        setActivityResult({ status: 'success', value: summary });
      })
      .catch(error => setActivityResult({ status: 'error', message: errorMessage(error) }));
  }, []);

  const [geocodeResult, setGeocodeResult] = useState<IAsyncResult<string> | null>(null);
  const [reverseGeocodeResult, setReverseGeocodeResult] =
    useState<IAsyncResult<string> | null>(null);

  const handleGeocode = useCallback(() => {
    geocodeAsync(GEOCODE_ADDRESS)
      .then((results: ILocationGeocodedLocation[]) => {
        const first = results[0];
        if (!first) {
          setGeocodeResult({ status: 'error', message: 'No results' });
          return;
        }
        setGeocodeResult({
          status: 'success',
          value: `lat ${first.latitude.toFixed(5)}, lon ${first.longitude.toFixed(5)}`,
        });
      })
      .catch(error => setGeocodeResult({ status: 'error', message: errorMessage(error) }));
  }, []);

  const handleReverseGeocode = useCallback(() => {
    if (!lastPosition) {
      setReverseGeocodeResult({
        status: 'error',
        message: 'Get a position first (Position card above)',
      });
      return;
    }
    reverseGeocodeAsync(lastPosition.coords)
      .then((results: ILocationGeocodedAddress[]) => {
        const first = results[0];
        if (!first) {
          setReverseGeocodeResult({ status: 'error', message: 'No results' });
          return;
        }
        setReverseGeocodeResult({
          status: 'success',
          value:
            `${first.city ?? '—'}, ${first.country ?? '—'}\n` +
            `${first.formattedAddress ?? '—'}`,
        });
      })
      .catch(error =>
        setReverseGeocodeResult({ status: 'error', message: errorMessage(error) }),
      );
  }, [lastPosition]);

  const [backgroundRegistered, setBackgroundRegistered] =
    useState<ICapabilityStatus>('checking');
  const [backgroundActionResult, setBackgroundActionResult] =
    useState<IAsyncResult<string> | null>(null);
  const [useForegroundService, setUseForegroundService] = useState(false);

  const refreshBackgroundStatus = useCallback(() => {
    hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      .then(started => setBackgroundRegistered(toCapabilityStatus(started)))
      .catch(() => setBackgroundRegistered('no'));
  }, []);

  useEffect(() => {
    refreshBackgroundStatus();
  }, [refreshBackgroundStatus]);

  const handleStartBackground = useCallback(() => {
    startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      distanceInterval: 100,
      ...(useForegroundService
        ? {
            foregroundService: {
              notificationTitle: 'Location canary',
              notificationBody: 'Tracking your position in the background.',
            },
          }
        : {}),
    })
      .then(() => setBackgroundActionResult({ status: 'success', value: 'Started' }))
      .catch(error =>
        setBackgroundActionResult({ status: 'error', message: errorMessage(error) }),
      )
      .finally(refreshBackgroundStatus);
  }, [refreshBackgroundStatus, useForegroundService]);

  const handleStopBackground = useCallback(() => {
    stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      .then(() => setBackgroundActionResult({ status: 'success', value: 'Stopped' }))
      .catch(error =>
        setBackgroundActionResult({ status: 'error', message: errorMessage(error) }),
      )
      .finally(refreshBackgroundStatus);
  }, [refreshBackgroundStatus]);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="location-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Location</text>
            <text className="hero-body">
              @symbiote-native/location — foreground/background position,
              heading, geocoding, and motion activity. iOS Simulator has no
              real GPS but supports simulated location (Features → Location);
              Android emulator location is set via Extended Controls →
              Location.
            </text>
          </view>
        </view>

        <view testID="location-permissions-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Permissions</text>
          </view>
          <CapabilityRow
            testID="location-foreground-row"
            requestTestID="location-request-foreground-button"
            label="Foreground"
            status={foregroundStatus}
            onRequest={handleRequestForeground}
          />
          <CapabilityRow
            testID="location-background-row"
            requestTestID="location-request-background-button"
            label="Background"
            status={backgroundStatus}
            onRequest={handleRequestBackground}
          />
          <CapabilityRow
            testID="location-motion-row"
            requestTestID="location-request-motion-button"
            label="Motion activity"
            status={motionStatus}
            onRequest={handleRequestMotion}
          />
        </view>

        <view testID="location-position-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Position</text>
          </view>
          <ActionButton
            testID="location-get-position-button"
            title="Get current position"
            onPress={handleGetPosition}
            color={lineColor}
          />
          <view className="auth-capability-row">
            <text className="auth-capability-label">Watch</text>
            <view className="location-permission-actions">
              <view
                testID="location-watching-status"
                className={`auth-status-badge auth-status-badge-${isWatching ? 'yes' : 'no'}`}
              >
                <text className="auth-status-text">
                  {isWatching ? 'WATCHING' : 'NOT WATCHING'}
                </text>
              </view>
              <ActionButton
                testID="location-watch-toggle-button"
                title={isWatching ? 'Stop watching' : 'Start watching'}
                onPress={handleToggleWatch}
                color={lineColor}
              />
            </view>
          </view>
          <ResultBlock testID="location-position-result" result={positionResult} />
        </view>

        <view testID="location-heading-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Heading</text>
          </view>
          <ActionButton
            testID="location-get-heading-button"
            title="Get heading"
            onPress={handleGetHeading}
            color={lineColor}
          />
          <ResultBlock testID="location-heading-result" result={headingResult} />
        </view>

        <view testID="location-activity-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Motion activity</text>
          </view>
          <ActionButton
            testID="location-get-activity-button"
            title="Get current activity"
            onPress={handleGetActivity}
            color={lineColor}
          />
          <ResultBlock testID="location-activity-result" result={activityResult} />
        </view>

        <view testID="location-geocode-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Geocoding</text>
          </view>
          <text className="info-text">{GEOCODE_ADDRESS}</text>
          <ActionButton
            testID="location-geocode-button"
            title="Geocode address"
            onPress={handleGeocode}
            color={lineColor}
          />
          <ResultBlock testID="location-geocode-result" result={geocodeResult} />
          <ActionButton
            testID="location-reverse-geocode-button"
            title="Reverse geocode last position"
            onPress={handleReverseGeocode}
            color={lineColor}
          />
          <ResultBlock testID="location-reverse-geocode-result" result={reverseGeocodeResult} />
        </view>

        <view testID="location-background-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Background location</text>
          </view>
          <view
            testID="location-background-registered-status"
            className={`auth-status-badge auth-status-badge-${backgroundRegistered}`}
          >
            <text className="auth-status-text">
              {backgroundRegistered === 'checking'
                ? 'CHECKING…'
                : backgroundRegistered === 'yes'
                  ? 'REGISTERED'
                  : 'NOT REGISTERED'}
            </text>
          </view>
          <view className="auth-capability-row">
            <text className="auth-capability-label">Foreground service</text>
            <view className="location-permission-actions">
              <view
                testID="location-foreground-service-status"
                className={`auth-status-badge auth-status-badge-${useForegroundService ? 'yes' : 'no'}`}
              >
                <text className="auth-status-text">
                  {useForegroundService ? 'ON' : 'OFF'}
                </text>
              </view>
              <ActionButton
                testID="location-foreground-service-toggle"
                title={useForegroundService ? 'Turn off' : 'Turn on'}
                onPress={() => setUseForegroundService(current => !current)}
                color={lineColor}
              />
            </view>
          </view>
          <ActionButton
            testID="location-start-background-button"
            title="Start background updates"
            onPress={handleStartBackground}
            color={lineColor}
          />
          <ActionButton
            testID="location-stop-background-button"
            title="Stop background updates"
            onPress={handleStopBackground}
            color={lineColor}
          />
          <ResultBlock testID="location-background-result" result={backgroundActionResult} />
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
