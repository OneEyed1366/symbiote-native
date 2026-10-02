<script setup lang="ts">
import { computed } from 'vue';
import {
  enableNetworkProviderAsync,
  getBackgroundPermissionsAsync,
  getForegroundPermissionsAsync,
  getMotionActivityPermissionsAsync,
  getProviderStatusAsync,
  hasServicesEnabledAsync,
  requestBackgroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  requestMotionActivityPermissionsAsync,
  useBackgroundPermissions,
  useForegroundPermissions,
  useMotionActivityPermissions,
} from '@symbiote-native/location/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ResultRow from '../components/ResultRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Location);

const [foreground] = useForegroundPermissions();
const [background] = useBackgroundPermissions();
const [motion] = useMotionActivityPermissions();

function permissionLabel(response: { status: string; granted: boolean } | null): string {
  return response === null ? 'loading…' : `${response.status}, granted ${response.granted}`;
}

const foregroundText = computed(() => permissionLabel(foreground.value));
const backgroundText = computed(() => permissionLabel(background.value));
const motionText = computed(() => permissionLabel(motion.value));

const calls = [
  { label: 'getForegroundPermissionsAsync', run: () => getForegroundPermissionsAsync() },
  {
    label: 'requestForegroundPermissionsAsync',
    run: () => requestForegroundPermissionsAsync(),
  },
  { label: 'getBackgroundPermissionsAsync', run: () => getBackgroundPermissionsAsync() },
  {
    label: 'requestBackgroundPermissionsAsync',
    run: () => requestBackgroundPermissionsAsync(),
  },
  {
    label: 'getMotionActivityPermissionsAsync',
    run: () => getMotionActivityPermissionsAsync(),
  },
  {
    label: 'requestMotionActivityPermissionsAsync',
    run: () => requestMotionActivityPermissionsAsync(),
  },
  { label: 'hasServicesEnabledAsync', run: () => hasServicesEnabledAsync() },
  { label: 'getProviderStatusAsync', run: () => getProviderStatusAsync() },
  { label: 'enableNetworkProviderAsync (Android)', run: () => enableNetworkProviderAsync() },
];
</script>

<template>
  <Card testID="location-permissions-card" title="Permission hooks">
    <ResultRow
      testID="location-foreground-row"
      label="useForegroundPermissions"
      :value="foregroundText"
    />
    <ResultRow
      testID="location-background-row"
      label="useBackgroundPermissions"
      :value="backgroundText"
    />
    <ResultRow
      testID="location-motion-row"
      label="useMotionActivityPermissions"
      :value="motionText"
    />
  </Card>
  <CallConsole
    prefix="location-permission-calls"
    title="Permission calls"
    :color="color"
    hint="Background permission needs the foreground one first, a rejection there can be expected on a simulator."
    :calls="calls"
  />
</template>
