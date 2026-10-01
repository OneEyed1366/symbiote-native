<script setup lang="ts">
import { ref } from 'vue';
import {
  getCurrentWatchId,
  installWebGeolocationPolyfill,
} from '@symbiote-native/location/vue';
import CallConsole from '../components/CallConsole.vue';
import Explorer from '../components/Explorer.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import LocationBackground from './LocationBackground.vue';
import LocationOneShot from './LocationOneShot.vue';
import LocationOptionsCard from './LocationOptionsCard.vue';
import LocationPermissions from './LocationPermissions.vue';
import LocationWatchCard from './LocationWatchCard.vue';
import { INITIAL_OPTIONS } from './location-options';
import type { IOptionsForm } from './location-options';

const ROUTE = ROUTE_NAME.Location;
const color = lineColorOf(ROUTE);

const options = ref<IOptionsForm>({ ...INITIAL_OPTIONS });

function setOptions(patch: Partial<IOptionsForm>): void {
  options.value = { ...options.value, ...patch };
}

const polyfillCalls = [
  { label: 'installWebGeolocationPolyfill', run: async () => installWebGeolocationPolyfill() },
  { label: 'getCurrentWatchId', run: async () => getCurrentWatchId() },
];
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="location-scroll"
    title="Location"
    body="Know where the user is: current position, live tracking, compass heading, geocoding, motion activity, background updates and geofences. The iOS simulator takes a simulated location (Features, Location), the Android emulator uses Extended Controls."
  >
    <LocationPermissions />
    <LocationOneShot :options="options" :color="color" />
    <LocationWatchCard :options="options" :color="color" />
    <Explorer testID="location-explorer" :color="color">
      <LocationOptionsCard :form="options" :setForm="setOptions" :color="color" />
      <LocationBackground :options="options" />
      <CallConsole
        prefix="location-polyfill"
        title="Web geolocation polyfill"
        :color="color"
        :calls="polyfillCalls"
      />
    </Explorer>
  </ScreenShell>
</template>
