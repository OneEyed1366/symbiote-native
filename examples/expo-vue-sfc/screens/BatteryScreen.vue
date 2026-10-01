<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  BatteryState,
  isAvailableAsync,
  isBatteryOptimizationEnabledAsync,
} from '@symbiote-native/battery';
import {
  useBatteryLevel,
  useBatteryState,
  useLowPowerMode,
} from '@symbiote-native/battery/vue';
import Scenario from '../components/Scenario.vue';
import { toCapabilityStatus } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import CapabilityRow from './CapabilityRow.vue';
import ValueRow from './ValueRow.vue';

const MIN_MEASURABLE_LEVEL = 0;
const PERCENT_SCALE = 100;

function batteryStateLabel(state: BatteryState): string {
  switch (state) {
    case BatteryState.CHARGING:
      return 'Charging';
    case BatteryState.FULL:
      return 'Full';
    case BatteryState.UNPLUGGED:
      return 'Unplugged';
    case BatteryState.NOT_CHARGING:
      return 'Not charging (protecting battery)';
    default:
      return 'Unknown';
  }
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Battery];
const lineColor = LINE_COLOR[lineInfo.line];

const batteryLevel = useBatteryLevel();
const batteryState = useBatteryState();
const lowPowerMode = useLowPowerMode();

const availabilityStatus = ref<ICapabilityStatus>('checking');
const optimizationStatus = ref<ICapabilityStatus>('checking');

const batteryLevelText = computed(() =>
  batteryLevel.value < MIN_MEASURABLE_LEVEL
    ? 'unknown'
    : `${Math.round(batteryLevel.value * PERCENT_SCALE)}%`,
);

onMounted(() => {
  void isAvailableAsync().then(isSupported => {
    availabilityStatus.value = toCapabilityStatus(isSupported);
  });
  if (Platform.OS === 'android') {
    void isBatteryOptimizationEnabledAsync().then(isEnabled => {
      optimizationStatus.value = toCapabilityStatus(isEnabled);
    });
  }
});
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="battery-scroll" class="screen" contentContainerStyle="scroll-content">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Battery</text>
          <text class="hero-body">
            React to the battery: level, charging state and low-power mode update live through
            hooks, so the app can pause heavy work when the battery is low. A simulator reports the
            API as unavailable, use a real device.
          </text>
        </view>
      </view>

      <Scenario
        testID="battery-scenario"
        title="Pause sync and animations when the battery is low"
        why="Skip background uploads, heavy animations or video quality when the user is on low power or unplugged at low charge, and resume when they plug in."
        :steps="[
          'Turn Low Power Mode on in the system settings',
          'Plug the charger in and out',
          'Watch the live status card',
        ]"
        expect="Level, charging state and low power mode change on screen within a moment, without reloading."
      />

      <view testID="battery-live-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Live status</text>
        </view>
        <ValueRow label="Battery level" :value="batteryLevelText" />
        <ValueRow label="Battery state" :value="batteryStateLabel(batteryState)" />
        <ValueRow label="Low power mode" :value="lowPowerMode ? 'On' : 'Off'" />
      </view>

      <view testID="battery-capabilities-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Capabilities</text>
        </view>
        <CapabilityRow testID="battery-available" label="Available" :status="availabilityStatus" />
        <CapabilityRow
          v-if="Platform.OS === 'android'"
          testID="battery-optimization"
          label="Battery optimization enabled"
          :status="optimizationStatus"
        />
      </view>
    </scroll-view>
  </safe-area-view>
</template>
