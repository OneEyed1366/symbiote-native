<script setup lang="ts">
import {
  SensorType,
  useAnimatedSensor,
  useAnimatedStyle,
} from '@symbiote-native/reanimated/vue';

const TILT_SCALE = 40;
const SENSOR_INTERVAL_MS = 50;

// A box that leans with the device: needs a real sensor, so it is mounted on request
const rotation = useAnimatedSensor(SensorType.ROTATION, {
  interval: SENSOR_INTERVAL_MS,
});

const lean = useAnimatedStyle(() => {
  'worklet';
  return {
    transform: [
      { translateX: rotation.sensor.value.roll * TILT_SCALE },
      { translateY: rotation.sensor.value.pitch * TILT_SCALE },
    ],
  };
});
</script>

<template>
  <view testID="ra-sensor-box" class="ra-box" :style="lean" />
</template>
