<script lang="ts">
  // @symbiote-native/location tour stop — permissions (foreground/background/motion), a one-shot
  // position fetch plus a live watch, heading, motion activity, and geocoding. No Svelte-specific
  // wrapper exists yet, so every call goes straight to the plain async core functions and lands in
  // $state. defineTask() must run at module top level (packages/task-manager's own contract — the
  // app can be launched headlessly), hence it sits outside the component below. Svelte twin of
  // ../../expo-vue-sfc/screens/LocationScreen.vue.
  //
  // The "Foreground service" toggle passes `foregroundService` to startLocationUpdatesAsync,
  // which on Android promotes the task to a real foreground service (a persistent notification,
  // exempt from Doze) instead of a plain background task. That needs FOREGROUND_SERVICE and
  // FOREGROUND_SERVICE_LOCATION declared in the app's own AndroidManifest.xml — this canary's
  // native-link.json deliberately leaves @symbiote-native/location's own
  // isAndroidForegroundServiceEnabled unset (see its README), so on Android a start with the
  // toggle on is expected to reject with a SecurityException, not a bug either.
  import {
    MotionActivityConfidence,
    MotionActivityType,
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
  } from '@symbiote-native/location';
  import { defineTask } from '@symbiote-native/task-manager';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const BACKGROUND_LOCATION_TASK = 'expo-location-canary-demo';
  defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.error('expo-location-canary-demo failed:', error);
      return;
    }
    console.log('expo-location-canary-demo received:', data);
  });

  const GEOCODE_ADDRESS = '221B Baker Street, London';
  const CONFIDENCE_LABEL: Record<MotionActivityConfidence, string> = {
    [MotionActivityConfidence.Low]: 'Low',
    [MotionActivityConfidence.Medium]: 'Medium',
    [MotionActivityConfidence.High]: 'High',
  };

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  function toCapabilityStatus(value: boolean): ICapabilityStatus {
    return value ? 'yes' : 'no';
  }

  function capabilityStatusText(status: ICapabilityStatus): string {
    if (status === 'checking') return 'CHECKING…';
    return status === 'yes' ? 'YES' : 'NO';
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Location];
  const lineColor = LINE_COLOR[lineInfo.line];

  // Permissions
  let foregroundStatus = $state<ICapabilityStatus>('checking');
  let backgroundStatus = $state<ICapabilityStatus>('checking');
  let motionStatus = $state<ICapabilityStatus>('checking');

  // Position
  let position = $state<ILocationObject | null>(null);
  let positionError = $state<string | null>(null);
  let isWatching = $state(false);
  let watchSubscription: ILocationSubscription | null = null;

  // Heading
  let heading = $state<ILocationHeadingObject | null>(null);
  let headingError = $state<string | null>(null);

  // Motion activity
  let activity = $state<
    Array<{ type: MotionActivityType; confidence: MotionActivityConfidence }>
  >([]);
  let activityError = $state<string | null>(null);

  // Geocoding
  let geocodeResult = $state<ILocationGeocodedLocation | null>(null);
  let geocodeError = $state<string | null>(null);
  let reverseGeocodeResult = $state<ILocationGeocodedAddress | null>(null);
  let reverseGeocodeError = $state<string | null>(null);

  // Background location
  let backgroundRegistered = $state<ICapabilityStatus>('checking');
  let backgroundActionError = $state<string | null>(null);
  let useForegroundService = $state(false);

  // Mount-time probes: every write lands in an async continuation, so this effect reads nothing
  // reactive and runs exactly once — the Svelte equivalent of Vue's onMounted.
  $effect(() => {
    void getForegroundPermissionsAsync().then(response => {
      foregroundStatus = toCapabilityStatus(response.granted);
    });
    void getBackgroundPermissionsAsync().then(response => {
      backgroundStatus = toCapabilityStatus(response.granted);
    });
    void getMotionActivityPermissionsAsync().then(response => {
      motionStatus = toCapabilityStatus(response.granted);
    });
    void refreshBackgroundRegistered();
  });

  $effect(() => {
    return () => {
      watchSubscription?.remove();
    };
  });

  function handleRequestForeground(): void {
    void requestForegroundPermissionsAsync().then(response => {
      foregroundStatus = toCapabilityStatus(response.granted);
    });
  }

  function handleRequestBackground(): void {
    void requestBackgroundPermissionsAsync().then(response => {
      backgroundStatus = toCapabilityStatus(response.granted);
    });
  }

  function handleRequestMotion(): void {
    void requestMotionActivityPermissionsAsync().then(response => {
      motionStatus = toCapabilityStatus(response.granted);
    });
  }

  async function handleGetPosition(): Promise<void> {
    positionError = null;
    try {
      position = await getCurrentPositionAsync();
    } catch (reason) {
      positionError = String(reason);
    }
  }

  async function handleToggleWatch(): Promise<void> {
    if (isWatching) {
      watchSubscription?.remove();
      watchSubscription = null;
      isWatching = false;
      return;
    }
    positionError = null;
    try {
      watchSubscription = await watchPositionAsync({}, next => {
        position = next;
      });
      isWatching = true;
    } catch (reason) {
      positionError = String(reason);
    }
  }

  async function handleGetHeading(): Promise<void> {
    headingError = null;
    try {
      heading = await getHeadingAsync();
    } catch (reason) {
      headingError = String(reason);
    }
  }

  async function handleGetActivity(): Promise<void> {
    activityError = null;
    try {
      const result = await getMotionActivityAsync();
      activity = Object.values(MotionActivityType)
        .map(type => ({ type, state: result.activities[type] }))
        .filter(({ state }) => state.detected)
        .map(({ type, state }) => ({ type, confidence: state.confidence }));
    } catch (reason) {
      activityError = String(reason);
    }
  }

  async function handleGeocode(): Promise<void> {
    geocodeError = null;
    try {
      const [first] = await geocodeAsync(GEOCODE_ADDRESS);
      geocodeResult = first ?? null;
      if (!first) geocodeError = 'No results.';
    } catch (reason) {
      geocodeError = String(reason);
    }
  }

  async function handleReverseGeocode(): Promise<void> {
    reverseGeocodeError = null;
    if (!position) {
      reverseGeocodeError = 'Get the current position first.';
      return;
    }
    try {
      const [first] = await reverseGeocodeAsync(position.coords);
      reverseGeocodeResult = first ?? null;
      if (!first) reverseGeocodeError = 'No results.';
    } catch (reason) {
      reverseGeocodeError = String(reason);
    }
  }

  async function refreshBackgroundRegistered(): Promise<void> {
    const started = await hasStartedLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK,
    );
    backgroundRegistered = toCapabilityStatus(started);
  }

  async function handleStartBackground(): Promise<void> {
    backgroundActionError = null;
    try {
      await startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        distanceInterval: 100,
        ...(useForegroundService
          ? {
              foregroundService: {
                notificationTitle: 'Location canary',
                notificationBody: 'Tracking your position in the background.',
              },
            }
          : {}),
      });
    } catch (reason) {
      backgroundActionError = String(reason);
    }
    await refreshBackgroundRegistered();
  }

  async function handleStopBackground(): Promise<void> {
    backgroundActionError = null;
    try {
      await stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch (reason) {
      backgroundActionError = String(reason);
    }
    await refreshBackgroundRegistered();
  }

  const watchButtonTitle = $derived(
    isWatching ? 'Stop watching' : 'Start watching',
  );
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="location-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Location</text>
        <text class="hero-body">
          @symbiote-native/location — foreground/background position, heading,
          geocoding, and motion activity. iOS Simulator has no real GPS but
          supports simulated location (Features → Location); Android emulator
          location is set via Extended Controls → Location.
        </text>
      </view>
    </view>
    <view testID="location-permissions-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Permissions</text>
      </view>
      <view testID="location-foreground-row" class="auth-capability-row">
        <text class="auth-capability-label">Foreground</text>
        <view class={`auth-status-badge auth-status-badge-${foregroundStatus}`}>
          <text class="auth-status-text">
            {capabilityStatusText(foregroundStatus)}
          </text>
        </view>
      </view>
      <ActionButton
        testID="location-request-foreground-button"
        title="Request foreground"
        onPress={handleRequestForeground}
        color={lineColor}
      />
      <view testID="location-background-row" class="auth-capability-row">
        <text class="auth-capability-label">Background</text>
        <view class={`auth-status-badge auth-status-badge-${backgroundStatus}`}>
          <text class="auth-status-text">
            {capabilityStatusText(backgroundStatus)}
          </text>
        </view>
      </view>
      <ActionButton
        testID="location-request-background-button"
        title="Request background"
        onPress={handleRequestBackground}
        color={lineColor}
      />
      <view testID="location-motion-row" class="auth-capability-row">
        <text class="auth-capability-label">Motion activity</text>
        <view class={`auth-status-badge auth-status-badge-${motionStatus}`}>
          <text class="auth-status-text">
            {capabilityStatusText(motionStatus)}
          </text>
        </view>
      </view>
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
      <view class="button-row">
        <ActionButton
          testID="location-get-position-button"
          title="Get current position"
          onPress={handleGetPosition}
          color={lineColor}
        />
        <ActionButton
          testID="location-watch-toggle-button"
          title={watchButtonTitle}
          onPress={handleToggleWatch}
          color={lineColor}
        />
      </view>
      <view
        testID="location-watching-status"
        class={`auth-status-badge auth-status-badge-${isWatching ? 'yes' : 'no'}`}
      >
        <text class="auth-status-text">
          {isWatching ? 'WATCHING' : 'NOT WATCHING'}
        </text>
      </view>{#if positionError}<view
          testID="location-position-result"
          class="auth-result auth-result-error"
        >
          <text class="auth-result-text">{positionError}</text>
        </view>{:else if position}<view
          testID="location-position-result"
          class="sensor-reading-row"
        >
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">LAT</text>
            <text class="sensor-reading-value">
              {position.coords.latitude.toFixed(5)}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">LON</text>
            <text class="sensor-reading-value">
              {position.coords.longitude.toFixed(5)}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">ALT</text>
            <text class="sensor-reading-value">
              {position.coords.altitude?.toFixed(1) ?? '—'}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">ACC</text>
            <text class="sensor-reading-value">
              {position.coords.accuracy?.toFixed(1) ?? '—'}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">HDG</text>
            <text class="sensor-reading-value">
              {position.coords.heading?.toFixed(1) ?? '—'}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">SPD</text>
            <text class="sensor-reading-value">
              {position.coords.speed?.toFixed(1) ?? '—'}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">TIME</text>
            <text class="sensor-reading-value">
              {new Date(position.timestamp).toLocaleTimeString()}
            </text>
          </view>
        </view>{/if}
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
      />{#if headingError}<view
          testID="location-heading-result"
          class="auth-result auth-result-error"
        >
          <text class="auth-result-text">{headingError}</text>
        </view>{:else if heading}<view
          testID="location-heading-result"
          class="sensor-reading-row"
        >
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">TRUE</text>
            <text class="sensor-reading-value">
              {heading.trueHeading.toFixed(1)}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">MAG</text>
            <text class="sensor-reading-value">
              {heading.magHeading.toFixed(1)}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">ACC</text>
            <text class="sensor-reading-value">{heading.accuracy}</text>
          </view>
        </view>{/if}
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
      /><view testID="location-activity-result">
        {#if activityError}<text class="auth-result-text">
            {activityError}
          </text>{:else if activity.length === 0}<text class="info-text">
            no activity detected yet
          </text>{:else}{#each activity as entry (entry.type)}<view
              class="auth-capability-row"
            >
              <text class="auth-capability-label">{entry.type}</text>
              <text class="auth-value-text">
                {CONFIDENCE_LABEL[entry.confidence]}
              </text>
            </view>{/each}{/if}
      </view>
    </view>
    <view testID="location-geocode-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Geocoding</text>
      </view>
      <text class="info-text">{GEOCODE_ADDRESS}</text>
      <ActionButton
        testID="location-geocode-button"
        title="Geocode address"
        onPress={handleGeocode}
        color={lineColor}
      />{#if geocodeError}<view
          testID="location-geocode-result"
          class="auth-result auth-result-error"
        >
          <text class="auth-result-text">{geocodeError}</text>
        </view>{:else if geocodeResult}<view
          testID="location-geocode-result"
          class="sensor-reading-row"
        >
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">LAT</text>
            <text class="sensor-reading-value">
              {geocodeResult.latitude.toFixed(5)}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">LON</text>
            <text class="sensor-reading-value">
              {geocodeResult.longitude.toFixed(5)}
            </text>
          </view>
        </view>{/if}
      <ActionButton
        testID="location-reverse-geocode-button"
        title="Reverse geocode last position"
        onPress={handleReverseGeocode}
        color={lineColor}
      />{#if reverseGeocodeError}<view
          testID="location-reverse-geocode-result"
          class="auth-result auth-result-error"
        >
          <text class="auth-result-text">{reverseGeocodeError}</text>
        </view>{:else if reverseGeocodeResult}<view
          testID="location-reverse-geocode-result"
        >
          <text class="auth-value-text">
            {reverseGeocodeResult.city ?? '—'}, {reverseGeocodeResult.country ??
              '—'}
          </text>
          <text class="info-text">
            {reverseGeocodeResult.formattedAddress ?? '—'}
          </text>
        </view>{/if}
    </view>
    <view testID="location-background-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Background location</text>
        <view
          testID="location-background-registered-status"
          class={`auth-status-badge auth-status-badge-${backgroundRegistered}`}
        >
          <text class="auth-status-text">
            {capabilityStatusText(backgroundRegistered)}
          </text>
        </view>
      </view>
      <view testID="location-foreground-service-row" class="auth-capability-row">
        <text class="auth-capability-label">Foreground service</text>
        <view
          testID="location-foreground-service-status"
          class={`auth-status-badge auth-status-badge-${useForegroundService ? 'yes' : 'no'}`}
        >
          <text class="auth-status-text">
            {useForegroundService ? 'ON' : 'OFF'}
          </text>
        </view>
      </view>
      <view class="button-row">
        <ActionButton
          testID="location-foreground-service-toggle"
          title={useForegroundService ? 'Turn off' : 'Turn on'}
          onPress={() => (useForegroundService = !useForegroundService)}
          color={lineColor}
        />
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
      </view>{#if backgroundActionError}<text class="auth-result-text">
          {backgroundActionError}
        </text>{/if}
    </view>
  </scroll-view>
</safe-area-view>
