<!--
  @symbiote-native/location tour stop — permissions (foreground/background/motion), one-shot +
  watched position, heading, motion activity, geocoding, and a background-task registration card
  driven by @symbiote-native/task-manager's defineTask. No Vue-specific wrapper package exists yet
  for either dependency, so both are called directly from the Composition API. First port of this
  screen across the example suite — no React/Svelte/Solid/Angular twin to mirror yet.

  The "Foreground service" toggle passes `foregroundService` to startLocationUpdatesAsync, which
  on Android promotes the task to a real foreground service (a persistent notification, exempt
  from Doze) instead of a plain background task. That needs FOREGROUND_SERVICE and
  FOREGROUND_SERVICE_LOCATION declared in the app's own AndroidManifest.xml — this canary's
  native-link.json deliberately leaves @symbiote-native/location's own
  isAndroidForegroundServiceEnabled unset (see its README), so on Android a start with the toggle
  on is expected to reject with a SecurityException, not a bug either.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
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
} from '@symbiote-native/location/vue';
import type {
  ILocationGeocodedAddress,
  ILocationGeocodedLocation,
  ILocationHeadingObject,
  ILocationObject,
  ILocationSubscription,
  IMotionActivityObject,
} from '@symbiote-native/location/vue';
import { defineTask } from '@symbiote-native/task-manager/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DEMO_ADDRESS = '221B Baker Street, London';
const BACKGROUND_LOCATION_TASK = 'expo-location-canary-demo';

// Must run at module scope, not inside a lifecycle hook, so native can find it if the app is
// launched headlessly — a Vue SFC <script setup> block runs once per mount, which is fine for a
// demo screen mounted once per app session. See the task README.
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

function toBadgeText(status: ICapabilityStatus): string {
  return status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
}

function formatNumber(value: number | null, fractionDigits = 6): string {
  return value === null ? '—' : value.toFixed(fractionDigits);
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

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Location];
const lineColor = LINE_COLOR[lineInfo.line];

// Permissions
const foregroundPermission = ref<ICapabilityStatus>('checking');
const backgroundPermission = ref<ICapabilityStatus>('checking');
const motionPermission = ref<ICapabilityStatus>('checking');

// Position
const positionResult = ref<ILocationObject | null>(null);
const positionError = ref<string | null>(null);
const isWatching = ref(false);
let watchSubscription: ILocationSubscription | null = null;

const watchButtonTitle = computed(() =>
  isWatching.value ? 'Stop watching' : 'Start watching',
);

// Heading
const headingResult = ref<ILocationHeadingObject | null>(null);
const headingError = ref<string | null>(null);

// Motion activity
const activityResult = ref<IMotionActivityObject | null>(null);
const activityError = ref<string | null>(null);

const detectedActivities = computed(() => {
  if (!activityResult.value) return [];
  return Object.entries(activityResult.value.activities)
    .filter(([, state]) => state.detected)
    .map(([type, state]) => ({
      type,
      confidence: confidenceLabel(state.confidence),
    }));
});

// Geocoding
const geocodeResult = ref<ILocationGeocodedLocation | null>(null);
const geocodeError = ref<string | null>(null);
const reverseGeocodeResult = ref<ILocationGeocodedAddress | null>(null);
const reverseGeocodeError = ref<string | null>(null);
const reverseGeocodeMessage = ref<string | null>(null);

// Background location
const isBackgroundRegistered = ref<ICapabilityStatus>('checking');
const backgroundError = ref<string | null>(null);
const useForegroundService = ref(false);

function refreshBackgroundStatus(): void {
  void hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).then(
    started => {
      isBackgroundRegistered.value = toCapabilityStatus(started);
    },
  );
}

onMounted(() => {
  void getForegroundPermissionsAsync().then(response => {
    foregroundPermission.value = toCapabilityStatus(response.granted);
  });
  void getBackgroundPermissionsAsync().then(response => {
    backgroundPermission.value = toCapabilityStatus(response.granted);
  });
  void getMotionActivityPermissionsAsync().then(response => {
    motionPermission.value = toCapabilityStatus(response.granted);
  });
  refreshBackgroundStatus();
});

onUnmounted(() => {
  watchSubscription?.remove();
  watchSubscription = null;
});

function handleRequestForeground(): void {
  void requestForegroundPermissionsAsync()
    .then(response => {
      foregroundPermission.value = toCapabilityStatus(response.granted);
    })
    .catch(() => {
      foregroundPermission.value = 'no';
    });
}

function handleRequestBackground(): void {
  // Legitimately rejects on a simulator/device without the background-location permission this
  // demo does not request — not a bug.
  void requestBackgroundPermissionsAsync()
    .then(response => {
      backgroundPermission.value = toCapabilityStatus(response.granted);
    })
    .catch(() => {
      backgroundPermission.value = 'no';
    });
}

function handleRequestMotion(): void {
  void requestMotionActivityPermissionsAsync()
    .then(response => {
      motionPermission.value = toCapabilityStatus(response.granted);
    })
    .catch(() => {
      motionPermission.value = 'no';
    });
}

function handleGetPosition(): void {
  positionError.value = null;
  void getCurrentPositionAsync()
    .then(location => {
      positionResult.value = location;
    })
    .catch((error: Error) => {
      positionError.value = `get position failed: ${error.message}`;
    });
}

function handleToggleWatch(): void {
  if (isWatching.value) {
    watchSubscription?.remove();
    watchSubscription = null;
    isWatching.value = false;
    return;
  }
  positionError.value = null;
  void watchPositionAsync(
    { distanceInterval: 1 },
    location => {
      positionResult.value = location;
    },
    reason => {
      positionError.value = `watch failed: ${reason}`;
    },
  )
    .then(subscription => {
      watchSubscription = subscription;
      isWatching.value = true;
    })
    .catch((error: Error) => {
      positionError.value = `start watching failed: ${error.message}`;
    });
}

function handleGetHeading(): void {
  headingError.value = null;
  void getHeadingAsync()
    .then(heading => {
      headingResult.value = heading;
    })
    .catch((error: Error) => {
      headingError.value = `get heading failed: ${error.message}`;
    });
}

function handleGetActivity(): void {
  activityError.value = null;
  void getMotionActivityAsync()
    .then(activity => {
      activityResult.value = activity;
    })
    .catch((error: Error) => {
      activityError.value = `get activity failed: ${error.message}`;
    });
}

function handleGeocode(): void {
  geocodeError.value = null;
  void geocodeAsync(DEMO_ADDRESS)
    .then(results => {
      const first = results[0] ?? null;
      geocodeResult.value = first;
      if (!first) geocodeError.value = 'no results';
    })
    .catch((error: Error) => {
      geocodeError.value = `geocode failed: ${error.message}`;
    });
}

function handleReverseGeocode(): void {
  reverseGeocodeError.value = null;
  if (!positionResult.value) {
    reverseGeocodeMessage.value = 'Get current position first.';
    return;
  }
  reverseGeocodeMessage.value = null;
  const { latitude, longitude } = positionResult.value.coords;
  void reverseGeocodeAsync({ latitude, longitude })
    .then(results => {
      const first = results[0] ?? null;
      reverseGeocodeResult.value = first;
      if (!first) reverseGeocodeError.value = 'no results';
    })
    .catch((error: Error) => {
      reverseGeocodeError.value = `reverse geocode failed: ${error.message}`;
    });
}

function handleStartBackground(): void {
  backgroundError.value = null;
  void startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    distanceInterval: 100,
    ...(useForegroundService.value
      ? {
          foregroundService: {
            notificationTitle: 'Location canary',
            notificationBody: 'Tracking your position in the background.',
          },
        }
      : {}),
  })
    .then(refreshBackgroundStatus)
    .catch((error: Error) => {
      backgroundError.value = `start background failed: ${error.message}`;
    });
}

function handleStopBackground(): void {
  backgroundError.value = null;
  void stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
    .then(refreshBackgroundStatus)
    .catch((error: Error) => {
      backgroundError.value = `stop background failed: ${error.message}`;
    });
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="location-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Location</text>
          <text class="hero-body"
            >@symbiote-native/location — foreground/background position,
            heading, geocoding, and motion activity. iOS Simulator has no real
            GPS but supports simulated location (Features → Location); Android
            emulator location is set via Extended Controls → Location.</text
          >
        </view>
      </view>

      <view testID="location-permissions-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Permissions</text>
        </view>
        <view testID="location-foreground-row" class="auth-capability-row">
          <text class="auth-capability-label">Foreground</text>
          <view
            :class="`auth-status-badge auth-status-badge-${foregroundPermission}`"
          >
            <text class="auth-status-text">{{
              toBadgeText(foregroundPermission)
            }}</text>
          </view>
        </view>
        <ActionButton
          testID="location-request-foreground-button"
          title="Request foreground"
          :onPress="handleRequestForeground"
          :color="lineColor"
        />
        <view testID="location-background-row" class="auth-capability-row">
          <text class="auth-capability-label">Background</text>
          <view
            :class="`auth-status-badge auth-status-badge-${backgroundPermission}`"
          >
            <text class="auth-status-text">{{
              toBadgeText(backgroundPermission)
            }}</text>
          </view>
        </view>
        <ActionButton
          testID="location-request-background-button"
          title="Request background"
          :onPress="handleRequestBackground"
          :color="lineColor"
        />
        <view testID="location-motion-row" class="auth-capability-row">
          <text class="auth-capability-label">Motion</text>
          <view
            :class="`auth-status-badge auth-status-badge-${motionPermission}`"
          >
            <text class="auth-status-text">{{
              toBadgeText(motionPermission)
            }}</text>
          </view>
        </view>
        <ActionButton
          testID="location-request-motion-button"
          title="Request motion"
          :onPress="handleRequestMotion"
          :color="lineColor"
        />
      </view>

      <view testID="location-position-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Position</text>
        </view>
        <view testID="location-watch-toggle-status" class="auth-capability-row">
          <text class="auth-capability-label">Watching</text>
          <view
            :class="`auth-status-badge auth-status-badge-${isWatching ? 'yes' : 'no'}`"
          >
            <text testID="location-watching-status" class="auth-status-text">{{
              isWatching ? 'WATCHING' : 'NOT WATCHING'
            }}</text>
          </view>
        </view>
        <view class="button-row">
          <ActionButton
            testID="location-get-position-button"
            title="Get current position"
            :onPress="handleGetPosition"
            :color="lineColor"
          />
          <ActionButton
            testID="location-watch-toggle-button"
            :title="watchButtonTitle"
            :onPress="handleToggleWatch"
            :color="lineColor"
          />
        </view>
        <view testID="location-position-result">
          <view v-if="positionError" class="auth-result auth-result-error">
            <text class="auth-result-text">{{ positionError }}</text>
          </view>
          <view v-else-if="positionResult">
            <view class="sensor-reading-row">
              <view class="sensor-reading-chip">
                <text class="sensor-reading-label">LAT</text>
                <text class="sensor-reading-value">{{
                  formatNumber(positionResult.coords.latitude)
                }}</text>
              </view>
              <view class="sensor-reading-chip">
                <text class="sensor-reading-label">LON</text>
                <text class="sensor-reading-value">{{
                  formatNumber(positionResult.coords.longitude)
                }}</text>
              </view>
            </view>
            <view class="sensor-reading-row">
              <view class="sensor-reading-chip">
                <text class="sensor-reading-label">ALT</text>
                <text class="sensor-reading-value">{{
                  formatNumber(positionResult.coords.altitude, 1)
                }}</text>
              </view>
              <view class="sensor-reading-chip">
                <text class="sensor-reading-label">ACCURACY</text>
                <text class="sensor-reading-value">{{
                  formatNumber(positionResult.coords.accuracy, 1)
                }}</text>
              </view>
            </view>
            <view class="sensor-reading-row">
              <view class="sensor-reading-chip">
                <text class="sensor-reading-label">HEADING</text>
                <text class="sensor-reading-value">{{
                  formatNumber(positionResult.coords.heading, 1)
                }}</text>
              </view>
              <view class="sensor-reading-chip">
                <text class="sensor-reading-label">SPEED</text>
                <text class="sensor-reading-value">{{
                  formatNumber(positionResult.coords.speed, 1)
                }}</text>
              </view>
            </view>
            <text class="auth-value-text">{{
              new Date(positionResult.timestamp).toLocaleTimeString()
            }}</text>
          </view>
          <text v-else class="info-text">No position fetched yet.</text>
        </view>
      </view>

      <view testID="location-heading-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Heading</text>
        </view>
        <ActionButton
          testID="location-get-heading-button"
          title="Get heading"
          :onPress="handleGetHeading"
          :color="lineColor"
        />
        <view testID="location-heading-result">
          <view v-if="headingError" class="auth-result auth-result-error">
            <text class="auth-result-text">{{ headingError }}</text>
          </view>
          <view v-else-if="headingResult" class="sensor-reading-row">
            <view class="sensor-reading-chip">
              <text class="sensor-reading-label">TRUE</text>
              <text class="sensor-reading-value"
                >{{ formatNumber(headingResult.trueHeading, 1) }}°</text
              >
            </view>
            <view class="sensor-reading-chip">
              <text class="sensor-reading-label">MAG</text>
              <text class="sensor-reading-value"
                >{{ formatNumber(headingResult.magHeading, 1) }}°</text
              >
            </view>
            <view class="sensor-reading-chip">
              <text class="sensor-reading-label">ACCURACY</text>
              <text class="sensor-reading-value">{{
                headingResult.accuracy
              }}</text>
            </view>
          </view>
          <text v-else class="info-text">No heading fetched yet.</text>
        </view>
      </view>

      <view testID="location-activity-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Motion activity</text>
        </view>
        <ActionButton
          testID="location-get-activity-button"
          title="Get current activity"
          :onPress="handleGetActivity"
          :color="lineColor"
        />
        <view testID="location-activity-result">
          <view v-if="activityError" class="auth-result auth-result-error">
            <text class="auth-result-text">{{ activityError }}</text>
          </view>
          <view v-else-if="activityResult">
            <text v-if="detectedActivities.length === 0" class="info-text"
              >No activity detected.</text
            >
            <view
              v-for="activity in detectedActivities"
              :key="activity.type"
              class="auth-capability-row"
            >
              <text class="auth-capability-label">{{ activity.type }}</text>
              <text class="auth-value-text">{{ activity.confidence }}</text>
            </view>
          </view>
          <text v-else class="info-text">No activity fetched yet.</text>
        </view>
      </view>

      <view testID="location-geocode-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Geocoding</text>
        </view>
        <text class="info-text">{{ DEMO_ADDRESS }}</text>
        <view class="button-row">
          <ActionButton
            testID="location-geocode-button"
            title="Geocode address"
            :onPress="handleGeocode"
            :color="lineColor"
          />
          <ActionButton
            testID="location-reverse-geocode-button"
            title="Reverse geocode last position"
            :onPress="handleReverseGeocode"
            :color="lineColor"
          />
        </view>
        <view testID="location-geocode-result">
          <view v-if="geocodeError" class="auth-result auth-result-error">
            <text class="auth-result-text">{{ geocodeError }}</text>
          </view>
          <view v-else-if="geocodeResult" class="sensor-reading-row">
            <view class="sensor-reading-chip">
              <text class="sensor-reading-label">LAT</text>
              <text class="sensor-reading-value">{{
                formatNumber(geocodeResult.latitude)
              }}</text>
            </view>
            <view class="sensor-reading-chip">
              <text class="sensor-reading-label">LON</text>
              <text class="sensor-reading-value">{{
                formatNumber(geocodeResult.longitude)
              }}</text>
            </view>
          </view>
          <text v-else class="info-text">Not geocoded yet.</text>
        </view>
        <view testID="location-reverse-geocode-result">
          <text v-if="reverseGeocodeMessage" class="info-text">{{
            reverseGeocodeMessage
          }}</text>
          <view
            v-else-if="reverseGeocodeError"
            class="auth-result auth-result-error"
          >
            <text class="auth-result-text">{{ reverseGeocodeError }}</text>
          </view>
          <view v-else-if="reverseGeocodeResult">
            <text class="auth-value-text"
              >{{ reverseGeocodeResult.city ?? '—' }},
              {{ reverseGeocodeResult.country ?? '—' }}</text
            >
            <text class="info-text">{{
              reverseGeocodeResult.formattedAddress ?? '—'
            }}</text>
          </view>
          <text v-else class="info-text">Not reverse-geocoded yet.</text>
        </view>
      </view>

      <view testID="location-background-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Background location</text>
        </view>
        <text class="info-text"
          >Registers a background task via @symbiote-native/task-manager;
          requires the background-location permission this demo does not
          request.</text
        >
        <view class="auth-capability-row">
          <text class="auth-capability-label">Registered</text>
          <view
            :class="`auth-status-badge auth-status-badge-${isBackgroundRegistered}`"
          >
            <text
              testID="location-background-registered-status"
              class="auth-status-text"
              >{{ toBadgeText(isBackgroundRegistered) }}</text
            >
          </view>
        </view>
        <view testID="location-foreground-service-row" class="auth-capability-row">
          <text class="auth-capability-label">Foreground service</text>
          <view
            :class="`auth-status-badge auth-status-badge-${useForegroundService ? 'yes' : 'no'}`"
          >
            <text
              testID="location-foreground-service-status"
              class="auth-status-text"
              >{{ useForegroundService ? 'ON' : 'OFF' }}</text
            >
          </view>
        </view>
        <view class="button-row">
          <ActionButton
            testID="location-foreground-service-toggle"
            :title="useForegroundService ? 'Turn off' : 'Turn on'"
            :onPress="() => (useForegroundService = !useForegroundService)"
            :color="lineColor"
          />
          <ActionButton
            testID="location-start-background-button"
            title="Start"
            :onPress="handleStartBackground"
            :color="lineColor"
          />
          <ActionButton
            testID="location-stop-background-button"
            title="Stop"
            :onPress="handleStopBackground"
            :color="lineColor"
          />
        </view>
        <view v-if="backgroundError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ backgroundError }}</text>
        </view>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
