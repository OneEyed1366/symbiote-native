<script setup lang="ts">
import { ref } from 'vue';
import {
  geocodeAsync,
  getCurrentPositionAsync,
  getHeadingAsync,
  getLastKnownPositionAsync,
  getMotionActivityAsync,
  reverseGeocodeAsync,
} from '@symbiote-native/location/vue';
import type { ILocationObject } from '@symbiote-native/location/vue';
import CallConsole from '../components/CallConsole.vue';
import Field from '../components/Field.vue';
import Scenario from '../components/Scenario.vue';
import {
  describeActivity,
  describePosition,
  optionalNumber,
  toLocationOptions,
} from './location-options';
import type { IOptionsForm } from './location-options';

const props = defineProps<{ options: IOptionsForm; color: string }>();

const address = ref('221B Baker Street, London');
let last: ILocationObject | null = null;

const calls = [
  {
    label: 'getCurrentPositionAsync',
    run: async () => {
      const position = await getCurrentPositionAsync(toLocationOptions(props.options));
      last = position;
      return describePosition(position);
    },
  },
  {
    label: 'getLastKnownPositionAsync',
    run: async () => {
      const position = await getLastKnownPositionAsync({
        maxAge: optionalNumber(props.options.maxAge),
        requiredAccuracy: optionalNumber(props.options.requiredAccuracy),
      });
      return position && describePosition(position);
    },
  },
  { label: 'getHeadingAsync', run: () => getHeadingAsync() },
  {
    label: 'getMotionActivityAsync (iOS)',
    run: async () => describeActivity(await getMotionActivityAsync()),
  },
  { label: 'geocodeAsync', run: () => geocodeAsync(address.value) },
  {
    label: 'reverseGeocodeAsync (last position)',
    run: async () => {
      if (last === null) {
        throw new Error('get a position first');
      }
      return reverseGeocodeAsync(last.coords);
    },
  },
];
</script>

<template>
  <Scenario
    testID="location-geocode-card"
    title="Find where the user is right now, and turn it into an address"
    why="Show nearby stores, prefill a delivery address or tag a photo. One call gives the current coordinates, and reverse geocoding turns them into a street address."
    :steps="[
      'Allow location in the permission card above',
      'Press getCurrentPositionAsync (set a simulated location on a simulator)',
      'Press reverseGeocodeAsync, then try geocodeAsync with an address',
    ]"
    expect="The first call prints latitude, longitude and accuracy. Reverse geocoding prints the matching street address, and geocodeAsync prints coordinates for the typed address."
  >
    <Field
      testID="location-address-input"
      label="address for geocodeAsync"
      :value="address"
      :onChange="next => (address = next)"
    />
    <CallConsole
      isBare
      prefix="location-one-shot"
      title="One-shot calls"
      :color="color"
      hint="The simulator has no GPS, set a simulated location (iOS: Features, Location; Android: Extended Controls)."
      :calls="calls"
    />
  </Scenario>
</template>
