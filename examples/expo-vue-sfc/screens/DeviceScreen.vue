<script setup lang="ts">
import { ref } from 'vue';
import {
  DeviceType,
  brand,
  deviceName,
  deviceType,
  getDeviceTypeAsync,
  getUptimeAsync,
  isDevice,
  isRootedExperimentalAsync,
  manufacturer,
  modelName,
  osName,
  osVersion,
  totalMemory,
} from '@symbiote-native/device/vue';
import ActionButton from '../components/ActionButton.vue';
import Scenario from '../components/Scenario.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import ValueRow from './ValueRow.vue';

const BYTES_PER_UNIT = 1024;
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
type ISizeUnit = (typeof SIZE_UNITS)[number];

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'unknown';
  }
  let value = bytes;
  let unitIndex = 0;
  while (value >= BYTES_PER_UNIT && unitIndex < SIZE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  }
  const unit: ISizeUnit = SIZE_UNITS[unitIndex];
  const precision = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${unit}`;
}

function deviceTypeLabel(type: DeviceType | null): string {
  switch (type) {
    case DeviceType.PHONE:
      return 'Phone';
    case DeviceType.TABLET:
      return 'Tablet';
    case DeviceType.DESKTOP:
      return 'Desktop';
    case DeviceType.TV:
      return 'TV';
    default:
      return 'Unknown';
  }
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Device];
const lineColor = LINE_COLOR[lineInfo.line];

const asyncDeviceType = ref<string | null>(null);
const uptime = ref<number | null>(null);
const isRooted = ref<boolean | null>(null);

function handleGetDeviceType(): void {
  void getDeviceTypeAsync().then(value => {
    asyncDeviceType.value = deviceTypeLabel(value);
  });
}

function handleGetUptime(): void {
  void getUptimeAsync().then(value => {
    uptime.value = value;
  });
}

function handleCheckRooted(): void {
  void isRootedExperimentalAsync().then(value => {
    isRooted.value = value;
  });
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="device-scroll" class="screen" contentContainerStyle="scroll-content">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Device</text>
          <text class="hero-body">
            Know what the app runs on: brand, model, OS version, memory, device type, uptime and
            whether the phone is rooted or jailbroken. Use it to adapt layouts, log bug reports and
            gate risky features.
          </text>
        </view>
      </view>

      <Scenario
        testID="device-scenario"
        title="Attach device details to a bug report or adapt to a tablet"
        why="Support tickets are far easier to solve with the model and OS version attached, and a tablet or a low-memory phone may need a different layout or lighter images."
        :steps="[
          'Read the constants card',
          'Press the async checks for device type, uptime and root detection',
        ]"
        expect="Model, OS and memory match the phone in your hand. The simulator reports Is real device as No, and the root check returns false on a normal phone."
      />

      <view testID="device-constants-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Constants</text>
        </view>
        <ValueRow label="Is real device" :value="isDevice ? 'Yes' : 'No'" />
        <ValueRow label="Brand" :value="brand ?? 'unknown'" />
        <ValueRow label="Manufacturer" :value="manufacturer ?? 'unknown'" />
        <ValueRow label="Model" :value="modelName ?? 'unknown'" />
        <ValueRow label="Device type" :value="deviceTypeLabel(deviceType)" />
        <ValueRow label="OS" :value="osName ?? 'unknown'" />
        <ValueRow label="OS version" :value="osVersion ?? 'unknown'" />
        <ValueRow label="Total memory" :value="formatBytes(totalMemory)" />
        <ValueRow label="Device name" :value="deviceName ?? 'unknown'" />
      </view>

      <view testID="device-async-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Async checks</text>
        </view>
        <ActionButton
          testID="device-type-button"
          title="Get device type"
          :onPress="handleGetDeviceType"
          :color="lineColor"
        />
        <ValueRow
          v-if="asyncDeviceType !== null"
          label="Device type (async)"
          :value="asyncDeviceType"
        />
        <ActionButton
          testID="device-uptime-button"
          title="Get uptime"
          :onPress="handleGetUptime"
          :color="lineColor"
        />
        <ValueRow v-if="uptime !== null" label="Uptime" :value="`${uptime}ms`" />
        <ActionButton
          testID="device-rooted-button"
          title="Check rooted/jailbroken"
          :onPress="handleCheckRooted"
          :color="lineColor"
        />
        <ValueRow
          v-if="isRooted !== null"
          label="Rooted/jailbroken"
          :value="isRooted ? 'true' : 'false'"
        />
      </view>
    </scroll-view>
  </safe-area-view>
</template>
