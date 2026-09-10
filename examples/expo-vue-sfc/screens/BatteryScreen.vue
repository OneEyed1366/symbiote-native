<!--
  @symbiote-native/battery tour stop — a live card driven by the three composables
  (useBatteryLevel/useBatteryState/useLowPowerMode) plus a one-shot capabilities card
  (isAvailableAsync, Android-only isBatteryOptimizationEnabledAsync). A Simulator with no
  physical battery reports the API as unavailable; a real device is needed for live readings.
  Vue SFC twin of ../../react/screens/BatteryScreen.tsx.
-->
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
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function batteryStateLabel(state: BatteryState): string {
  switch (state) {
    case BatteryState.CHARGING:
      return 'Charging';
    case BatteryState.FULL:
      return 'Full';
    case BatteryState.UNPLUGGED:
      return 'Unplugged';
    case BatteryState.NOT_CHARGING:
      return 'Not charging (protected)';
    default:
      return 'Unknown';
  }
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Battery];
const lineColor = LINE_COLOR[lineInfo.line];

const batteryLevel = useBatteryLevel();
const batteryState = useBatteryState();
const lowPowerMode = useLowPowerMode();

const batteryLevelText = computed(() =>
  batteryLevel.value < 0
    ? 'unknown'
    : `${Math.round(batteryLevel.value * 100)}%`,
);
const batteryStateText = computed(() => batteryStateLabel(batteryState.value));
const lowPowerModeText = computed(() => (lowPowerMode.value ? 'ON' : 'OFF'));

const isAvailable = ref<ICapabilityStatus>('checking');
const isOptimizationEnabled = ref<ICapabilityStatus>('checking');

onMounted(() => {
  void isAvailableAsync().then(value => {
    isAvailable.value = toCapabilityStatus(value);
  });
  if (Platform.OS === 'android') {
    void isBatteryOptimizationEnabledAsync().then(value => {
      isOptimizationEnabled.value = toCapabilityStatus(value);
    });
  }
});
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="battery-scroll"
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
          <text class="hero-title">Battery</text>
          <text class="hero-body"
            >@symbiote-native/battery — live battery level, charging state, and
            low-power mode, over three Vue composables. The iOS Simulator
            reports the battery API as unavailable; a real device is needed to
            see live readings.</text
          >
        </view>
      </view>

      <view testID="battery-live-card" class="battery-card">
        <text class="battery-card-title">Live</text>
        <view class="battery-row">
          <text class="battery-row-label">Level</text>
          <text testID="battery-level-value" class="battery-value-text">{{
            batteryLevelText
          }}</text>
        </view>
        <view class="battery-row">
          <text class="battery-row-label">State</text>
          <text testID="battery-state-value" class="battery-value-text">{{
            batteryStateText
          }}</text>
        </view>
        <view class="battery-row">
          <text class="battery-row-label">Low power mode</text>
          <text testID="battery-low-power-value" class="battery-value-text">{{
            lowPowerModeText
          }}</text>
        </view>
      </view>

      <view testID="battery-capabilities-card" class="battery-card">
        <text class="battery-card-title">Capabilities</text>
        <view class="battery-row">
          <text class="battery-row-label">Available</text>
          <view
            :class="`battery-status-badge battery-status-badge-${isAvailable}`"
          >
            <text class="battery-status-text">{{
              isAvailable === 'checking'
                ? 'CHECKING…'
                : isAvailable === 'yes'
                  ? 'YES'
                  : 'NO'
            }}</text>
          </view>
        </view>
        <view v-if="Platform.OS === 'android'" class="battery-row">
          <text class="battery-row-label">Battery optimization enabled</text>
          <view
            :class="`battery-status-badge battery-status-badge-${isOptimizationEnabled}`"
          >
            <text class="battery-status-text">{{
              isOptimizationEnabled === 'checking'
                ? 'CHECKING…'
                : isOptimizationEnabled === 'yes'
                  ? 'YES'
                  : 'NO'
            }}</text>
          </view>
        </view>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
