<script setup lang="ts">
import {
  Accelerometer,
  DeviceMotion,
  Gyroscope,
  Magnetometer,
  isAvailableAsync as isPedometerAvailableAsync,
} from '@symbiote-native/sensors';
import {
  useAccelerometer,
  useDeviceMotion,
  useGyroscope,
  useMagnetometer,
  usePedometer,
} from '@symbiote-native/sensors/vue';
import Scenario from '../components/Scenario.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import AxisReadingRow from './AxisReadingRow.vue';
import SensorCard from './SensorCard.vue';
import { useSensorStatus } from './use-sensor-status';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sensors];

const accelerometer = useAccelerometer();
const accelerometerStatus = useSensorStatus(
  () => Accelerometer.isAvailableAsync(),
  () => accelerometer.value !== null,
);

const gyroscope = useGyroscope();
const gyroscopeStatus = useSensorStatus(
  () => Gyroscope.isAvailableAsync(),
  () => gyroscope.value !== null,
);

const magnetometer = useMagnetometer();
const magnetometerStatus = useSensorStatus(
  () => Magnetometer.isAvailableAsync(),
  () => magnetometer.value !== null,
);

const deviceMotion = useDeviceMotion();
const deviceMotionStatus = useSensorStatus(
  () => DeviceMotion.isAvailableAsync(),
  () => deviceMotion.value !== null,
);

const pedometer = usePedometer();
const pedometerStatus = useSensorStatus(
  () => isPedometerAvailableAsync(),
  () => pedometer.value !== null,
);
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="sensors-scroll" class="screen" contentContainerStyle="scroll-content">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: LINE_COLOR.sensors }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Sensors</text>
          <text class="hero-body">
            Read the phone's motion hardware live: accelerometer, gyroscope, magnetometer, combined
            device motion and step counter. A simulator reports every sensor as unavailable, use a
            real device.
          </text>
        </view>
      </view>

      <Scenario
        testID="sensors-scenario"
        title="Detect a shake, a tilt, a compass heading or a step"
        why="Games, level tools and fitness features read the motion sensors: tilt to steer, shake to undo, magnetometer for a compass and the pedometer for steps."
        :steps="[
          'Tilt and shake the phone and watch the accelerometer',
          'Rotate it and watch the gyroscope',
          'Walk a few steps and watch the pedometer',
        ]"
        expect="The numbers change live with each movement. A card that says unavailable means the device has no such sensor or the simulator cannot provide it."
      />

      <SensorCard testID="sensors-accelerometer" title="Accelerometer" :status="accelerometerStatus">
        <AxisReadingRow v-if="accelerometer" :measurement="accelerometer" />
      </SensorCard>

      <SensorCard testID="sensors-gyroscope" title="Gyroscope" :status="gyroscopeStatus">
        <AxisReadingRow v-if="gyroscope" :measurement="gyroscope" />
      </SensorCard>

      <SensorCard testID="sensors-magnetometer" title="Magnetometer" :status="magnetometerStatus">
        <AxisReadingRow v-if="magnetometer" :measurement="magnetometer" />
      </SensorCard>

      <SensorCard testID="sensors-device-motion" title="Device motion" :status="deviceMotionStatus">
        <text v-if="deviceMotion" class="info-text">
          {{ `interval: ${deviceMotion.interval.toFixed(1)}ms` }}
        </text>
        <view v-if="deviceMotion?.rotation" class="sensor-reading-row">
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">ALPHA</text>
            <text class="sensor-reading-value">{{ deviceMotion.rotation.alpha.toFixed(3) }}</text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">BETA</text>
            <text class="sensor-reading-value">{{ deviceMotion.rotation.beta.toFixed(3) }}</text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">GAMMA</text>
            <text class="sensor-reading-value">{{ deviceMotion.rotation.gamma.toFixed(3) }}</text>
          </view>
        </view>
      </SensorCard>

      <SensorCard testID="sensors-pedometer" title="Pedometer" :status="pedometerStatus">
        <text v-if="pedometer" testID="sensors-pedometer-steps" class="sensor-reading-value">
          {{ `${pedometer.steps} steps` }}
        </text>
      </SensorCard>
    </scroll-view>
  </safe-area-view>
</template>
