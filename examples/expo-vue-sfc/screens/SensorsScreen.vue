<!--
  @symbiote-native/sensors tour stop — one card per DeviceSensor-shaped sensor (Accelerometer,
  Gyroscope, Magnetometer, DeviceMotion) plus Pedometer (free functions, no shared instance —
  see packages/sensors/src/core/pedometer.ts). Every composable comes straight from
  @symbiote-native/sensors/vue; the core singletons/free functions (imported from the package
  root) are used ONLY for their own isAvailableAsync() check, kept as a separate ref per sensor
  so "not available on this device" never gets conflated with "no reading yet" — both look
  identical on the iOS Simulator (no real CoreMotion/CMPedometer hardware), and only a distinct
  UI state tells them apart (see the symbiote-expo-native-module skill). Vue SFC twin of
  ../../react/screens/SensorsScreen.tsx — same 4-state card (checking/unavailable/waiting/live)
  and X/Y/Z reading-chip layout, React being this repo's "prove the pattern first" adapter for
  this package.
-->
<script setup lang="ts">
import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import {} from '@symbiote-native/vue';
import {
  Accelerometer,
  Gyroscope,
  Magnetometer,
  DeviceMotion,
  isAvailableAsync as isPedometerAvailableAsync,
} from '@symbiote-native/sensors';
import {
  useAccelerometer,
  useGyroscope,
  useMagnetometer,
  useDeviceMotion,
  usePedometer,
} from '@symbiote-native/sensors/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sensors];

type ISensorAvailability = 'checking' | 'unavailable' | 'available';
type ISensorStatus = 'checking' | 'unavailable' | 'waiting' | 'live';

const SENSOR_STATUS_TEXT: Record<ISensorStatus, string> = {
  checking: 'CHECKING…',
  unavailable: 'UNAVAILABLE',
  waiting: 'WAITING…',
  live: 'LIVE',
};

// Wires one sensor's own isAvailableAsync() check into a local ref, on mount — kept separate
// from the composable's live-reading ref so "checking" / "not available" / "waiting for first
// reading" render as three genuinely distinct states, not one blank guess.
function useSensorAvailability(
  checkAsync: () => Promise<boolean>,
): Ref<ISensorAvailability> {
  const availability = ref<ISensorAvailability>('checking');
  onMounted(() => {
    void checkAsync().then(available => {
      availability.value = available ? 'available' : 'unavailable';
    });
  });
  return availability;
}

function sensorStatus(
  availability: Ref<ISensorAvailability>,
  hasReading: () => boolean,
): ComputedRef<ISensorStatus> {
  return computed(() => {
    if (availability.value === 'checking') return 'checking';
    if (availability.value === 'unavailable') return 'unavailable';
    return hasReading() ? 'live' : 'waiting';
  });
}

const accelerometer = useAccelerometer();
const accelerometerAvailability = useSensorAvailability(() =>
  Accelerometer.isAvailableAsync(),
);
const accelerometerStatus = sensorStatus(
  accelerometerAvailability,
  () => accelerometer.value !== null,
);

const gyroscope = useGyroscope();
const gyroscopeAvailability = useSensorAvailability(() =>
  Gyroscope.isAvailableAsync(),
);
const gyroscopeStatus = sensorStatus(
  gyroscopeAvailability,
  () => gyroscope.value !== null,
);

const magnetometer = useMagnetometer();
const magnetometerAvailability = useSensorAvailability(() =>
  Magnetometer.isAvailableAsync(),
);
const magnetometerStatus = sensorStatus(
  magnetometerAvailability,
  () => magnetometer.value !== null,
);

const deviceMotion = useDeviceMotion();
const deviceMotionAvailability = useSensorAvailability(() =>
  DeviceMotion.isAvailableAsync(),
);
const deviceMotionStatus = sensorStatus(
  deviceMotionAvailability,
  () => deviceMotion.value !== null,
);

const pedometer = usePedometer();
const pedometerAvailability = useSensorAvailability(() =>
  isPedometerAvailableAsync(),
);
const pedometerStatus = sensorStatus(
  pedometerAvailability,
  () => pedometer.value !== null,
);
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="sensors-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view
          class="hero-badge"
          :style="{ backgroundColor: LINE_COLOR.sensors }"
        >
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Sensors</text>
          <text class="hero-body"
            >@symbiote-native/sensors — live readings from five
            expo-sensors-backed hooks. A simulator reports every
            CoreMotion/CMPedometer-backed sensor as unavailable; a real device
            is needed to see live readings.</text
          >
        </view>
      </view>

      <!-- Accelerometer -->
      <view testID="sensor-card-accelerometer" class="sensor-card">
        <view class="sensor-card-header">
          <text class="sensor-card-title">Accelerometer</text>
          <view
            :class="`sensor-status-badge sensor-status-badge-${accelerometerStatus}`"
          >
            <text class="sensor-status-text">{{
              SENSOR_STATUS_TEXT[accelerometerStatus]
            }}</text>
          </view>
        </view>
        <text v-if="accelerometerStatus === 'checking'" class="info-text"
          >checking availability…</text
        >
        <text
          v-else-if="accelerometerStatus === 'unavailable'"
          class="info-text"
          >not available on this device</text
        >
        <text v-else-if="accelerometerStatus === 'waiting'" class="info-text"
          >waiting for first reading…</text
        >
        <view v-else-if="accelerometer" class="sensor-reading-row">
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">X</text>
            <text class="sensor-reading-value">{{
              accelerometer.x.toFixed(3)
            }}</text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">Y</text>
            <text class="sensor-reading-value">{{
              accelerometer.y.toFixed(3)
            }}</text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">Z</text>
            <text class="sensor-reading-value">{{
              accelerometer.z.toFixed(3)
            }}</text>
          </view>
        </view>
      </view>

      <!-- Gyroscope -->
      <view testID="sensor-card-gyroscope" class="sensor-card">
        <view class="sensor-card-header">
          <text class="sensor-card-title">Gyroscope</text>
          <view
            :class="`sensor-status-badge sensor-status-badge-${gyroscopeStatus}`"
          >
            <text class="sensor-status-text">{{
              SENSOR_STATUS_TEXT[gyroscopeStatus]
            }}</text>
          </view>
        </view>
        <text v-if="gyroscopeStatus === 'checking'" class="info-text"
          >checking availability…</text
        >
        <text v-else-if="gyroscopeStatus === 'unavailable'" class="info-text"
          >not available on this device</text
        >
        <text v-else-if="gyroscopeStatus === 'waiting'" class="info-text"
          >waiting for first reading…</text
        >
        <view v-else-if="gyroscope" class="sensor-reading-row">
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">X</text>
            <text class="sensor-reading-value">{{
              gyroscope.x.toFixed(3)
            }}</text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">Y</text>
            <text class="sensor-reading-value">{{
              gyroscope.y.toFixed(3)
            }}</text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">Z</text>
            <text class="sensor-reading-value">{{
              gyroscope.z.toFixed(3)
            }}</text>
          </view>
        </view>
      </view>

      <!-- Magnetometer -->
      <view testID="sensor-card-magnetometer" class="sensor-card">
        <view class="sensor-card-header">
          <text class="sensor-card-title">Magnetometer</text>
          <view
            :class="`sensor-status-badge sensor-status-badge-${magnetometerStatus}`"
          >
            <text class="sensor-status-text">{{
              SENSOR_STATUS_TEXT[magnetometerStatus]
            }}</text>
          </view>
        </view>
        <text v-if="magnetometerStatus === 'checking'" class="info-text"
          >checking availability…</text
        >
        <text v-else-if="magnetometerStatus === 'unavailable'" class="info-text"
          >not available on this device</text
        >
        <text v-else-if="magnetometerStatus === 'waiting'" class="info-text"
          >waiting for first reading…</text
        >
        <view v-else-if="magnetometer" class="sensor-reading-row">
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">X</text>
            <text class="sensor-reading-value">{{
              magnetometer.x.toFixed(3)
            }}</text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">Y</text>
            <text class="sensor-reading-value">{{
              magnetometer.y.toFixed(3)
            }}</text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">Z</text>
            <text class="sensor-reading-value">{{
              magnetometer.z.toFixed(3)
            }}</text>
          </view>
        </view>
      </view>

      <!-- DeviceMotion — rotation is nested and can legitimately be absent from the very first
           event (the underlying sensor hasn't reported yet), so it's guarded at the field
           itself (deviceMotion?.rotation, not deviceMotion && deviceMotion.rotation — an
           unguarded nested read throws with no visible error and silently blanks the screen). -->
      <view testID="sensor-card-device-motion" class="sensor-card">
        <view class="sensor-card-header">
          <text class="sensor-card-title">Device motion</text>
          <view
            :class="`sensor-status-badge sensor-status-badge-${deviceMotionStatus}`"
          >
            <text class="sensor-status-text">{{
              SENSOR_STATUS_TEXT[deviceMotionStatus]
            }}</text>
          </view>
        </view>
        <text v-if="deviceMotionStatus === 'checking'" class="info-text"
          >checking availability…</text
        >
        <text v-else-if="deviceMotionStatus === 'unavailable'" class="info-text"
          >not available on this device</text
        >
        <text v-else-if="deviceMotionStatus === 'waiting'" class="info-text"
          >waiting for first reading…</text
        >
        <template v-else-if="deviceMotion">
          <text class="info-text">{{
            `interval: ${deviceMotion.interval.toFixed(1)}ms`
          }}</text>
          <view v-if="deviceMotion.rotation" class="sensor-reading-row">
            <view class="sensor-reading-chip">
              <text class="sensor-reading-label">ALPHA</text>
              <text class="sensor-reading-value">{{
                deviceMotion.rotation.alpha.toFixed(3)
              }}</text>
            </view>
            <view class="sensor-reading-chip">
              <text class="sensor-reading-label">BETA</text>
              <text class="sensor-reading-value">{{
                deviceMotion.rotation.beta.toFixed(3)
              }}</text>
            </view>
            <view class="sensor-reading-chip">
              <text class="sensor-reading-label">GAMMA</text>
              <text class="sensor-reading-value">{{
                deviceMotion.rotation.gamma.toFixed(3)
              }}</text>
            </view>
          </view>
        </template>
      </view>

      <!-- Pedometer — free functions, no shared instance, so both the availability check and
           the live subscription go through the standalone core exports instead of a singleton. -->
      <view testID="sensor-card-pedometer" class="sensor-card">
        <view class="sensor-card-header">
          <text class="sensor-card-title">Pedometer</text>
          <view
            :class="`sensor-status-badge sensor-status-badge-${pedometerStatus}`"
          >
            <text class="sensor-status-text">{{
              SENSOR_STATUS_TEXT[pedometerStatus]
            }}</text>
          </view>
        </view>
        <text v-if="pedometerStatus === 'checking'" class="info-text"
          >checking availability…</text
        >
        <text v-else-if="pedometerStatus === 'unavailable'" class="info-text"
          >not available on this device</text
        >
        <text v-else-if="pedometerStatus === 'waiting'" class="info-text"
          >waiting for first reading…</text
        >
        <text
          v-else-if="pedometer"
          testID="sensors-pedometer-steps"
          class="sensor-reading-value"
          >{{ `${pedometer.steps} steps` }}</text
        >
      </view>
    </scroll-view>
  </safe-area-view>
</template>
