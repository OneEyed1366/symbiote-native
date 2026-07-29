<!--
  @symbiote-native/device tour stop — an eager-constants card (isDevice/brand/manufacturer/
  modelName/deviceType/osName/osVersion/totalMemory/deviceName, all resolved once at import time,
  no onMounted needed) plus an actions card for the three one-shot async/sync calls
  (getDeviceTypeAsync/getUptimeAsync/isRootedExperimentalAsync). Vue SFC twin of
  ../../react/screens/DeviceScreen.tsx.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
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
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const BYTES_PER_UNIT = 1024;
const MEMORY_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const DECIMAL_PLACES = 1;

function formatMemorySize(bytes: number | null): string {
  if (bytes === null) return 'unknown';
  if (bytes === 0) return '0 B';
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT)),
    MEMORY_UNITS.length - 1,
  );
  const value = bytes / BYTES_PER_UNIT ** unitIndex;
  return `${value.toFixed(unitIndex === 0 ? 0 : DECIMAL_PLACES)} ${MEMORY_UNITS[unitIndex]}`;
}

function deviceTypeLabel(type: DeviceType | null): string {
  switch (type) {
    case DeviceType.UNKNOWN:
      return 'Unknown';
    case DeviceType.PHONE:
      return 'Phone';
    case DeviceType.TABLET:
      return 'Tablet';
    case DeviceType.DESKTOP:
      return 'Desktop';
    case DeviceType.TV:
      return 'TV';
    default:
      return 'checking…';
  }
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Device];
const lineColor = LINE_COLOR[lineInfo.line];

const totalMemoryText = formatMemorySize(totalMemory);

const deviceTypeResult = ref<string | null>(null);
const uptimeResult = ref<number | null>(null);
const isRootedResult = ref<boolean | null>(null);

function handleGetDeviceType(): void {
  void getDeviceTypeAsync().then(type => {
    deviceTypeResult.value = deviceTypeLabel(type);
  });
}

function handleGetUptime(): void {
  void getUptimeAsync().then(value => {
    uptimeResult.value = value;
  });
}

function handleCheckRooted(): void {
  void isRootedExperimentalAsync().then(value => {
    isRootedResult.value = value;
  });
}
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView testID="device-scroll" class="screen" content-container-style="scroll-content">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: lineColor }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Device</Text>
          <Text class="hero-body"
            >@symbiote-native/device — physical device info: brand/model/OS constants, memory,
            and best-effort root/jailbreak detection. A Simulator/emulator reports `isDevice` as
            false and several fields as unavailable.</Text
          >
        </View>
      </View>

      <View testID="device-info-card" class="device-card">
        <Text class="device-card-title">Info</Text>
        <View class="device-row">
          <Text class="device-row-label">Is device</Text>
          <Text testID="device-is-device-value" class="device-value-text">{{ isDevice ? 'Yes' : 'No (simulator/emulator)' }}</Text>
        </View>
        <View class="device-row">
          <Text class="device-row-label">Brand</Text>
          <Text class="device-value-text">{{ brand ?? 'unknown' }}</Text>
        </View>
        <View class="device-row">
          <Text class="device-row-label">Manufacturer</Text>
          <Text class="device-value-text">{{ manufacturer ?? 'unknown' }}</Text>
        </View>
        <View class="device-row">
          <Text class="device-row-label">Model name</Text>
          <Text class="device-value-text">{{ modelName ?? 'unknown' }}</Text>
        </View>
        <View class="device-row">
          <Text class="device-row-label">Device type</Text>
          <Text class="device-value-text">{{ deviceTypeLabel(deviceType) }}</Text>
        </View>
        <View class="device-row">
          <Text class="device-row-label">OS</Text>
          <Text class="device-value-text">{{ `${osName ?? 'unknown'} ${osVersion ?? ''}` }}</Text>
        </View>
        <View class="device-row">
          <Text class="device-row-label">Total memory</Text>
          <Text class="device-value-text">{{ totalMemoryText }}</Text>
        </View>
        <View class="device-row">
          <Text class="device-row-label">Device name</Text>
          <Text testID="device-name-value" class="device-value-text">{{ deviceName ?? 'unnamed device' }}</Text>
        </View>
      </View>

      <View testID="device-actions-card" class="device-card">
        <Text class="device-card-title">Actions</Text>
        <View class="button-row">
          <ActionButton
            testID="device-get-type-button"
            title="Get Device Type"
            :onPress="handleGetDeviceType"
            :color="lineColor"
          />
          <ActionButton
            testID="device-get-uptime-button"
            title="Get Uptime"
            :onPress="handleGetUptime"
            :color="lineColor"
          />
          <ActionButton
            testID="device-check-rooted-button"
            title="Check Rooted"
            :onPress="handleCheckRooted"
            :color="lineColor"
          />
        </View>
        <View v-if="deviceTypeResult !== null" class="device-row">
          <Text class="device-row-label">Device type result</Text>
          <Text testID="device-type-result-value" class="device-value-text">{{ deviceTypeResult }}</Text>
        </View>
        <View v-if="uptimeResult !== null" class="device-row">
          <Text class="device-row-label">Uptime</Text>
          <Text testID="device-uptime-result-value" class="device-value-text">{{ `${uptimeResult}ms` }}</Text>
        </View>
        <View v-if="isRootedResult !== null" class="device-row">
          <Text class="device-row-label">Rooted/jailbroken</Text>
          <Text testID="device-rooted-result-value" class="device-value-text">{{ isRootedResult ? 'true' : 'false' }}</Text>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
