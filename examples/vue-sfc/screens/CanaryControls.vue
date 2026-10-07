<script setup lang="ts">
import { computed, ref } from 'vue';
import { Slider } from '@symbiote-native/slider/vue';
import { LINE_COLOR } from '../navigation-lines';
import { TRACK_OFF } from './canary-shared';

const COLOR = LINE_COLOR.primitives;
const SPINNER_TRACK = { false: TRACK_OFF, true: COLOR };

const name = ref('');
const isSpinning = ref(true);
const isChecked = ref(false);
const volume = ref(0.5);
const greeting = computed(() => (name.value ? `Hello, ${name.value}` : 'Hello, stranger'));
const checkboxLabel = computed(() => (isChecked.value ? 'checkbox · checked' : 'checkbox · unchecked'));
const volumeLabel = computed(() => `volume · ${Math.round(volume.value * 100)}%`);
</script>

<template>
  <!-- On an element v-model compiles to a runtime directive that the adapter ships -->
  <text-input
    v-model="name"
    testID="greeting-input"
    placeholder="type your name…"
    placeholder-text-color="#41506a"
    class="text-input"
  />
  <text
    testID="greeting-output"
    class="greeting"
  >
    {{ greeting }}
  </text>
  <!-- The switch drives the ActivityIndicator below it -->
  <view class="switch-row">
    <text class="switch-label"> spinner </text>
    <switch
      v-model="isSpinning"
      testID="spinner-switch"
      :track-color="SPINNER_TRACK"
    />
  </view>
  <activity-indicator
    testID="spinner-indicator"
    :animating="isSpinning"
    :color="COLOR"
    size="large"
  />
  <!-- Built in, no native module: the box and the checkmark are views -->
  <view class="switch-row">
    <text class="switch-label">
      {{ checkboxLabel }}
    </text>
    <checkbox
      testID="canary-checkbox"
      :value="isChecked"
      :color="COLOR"
      @valueChange="event => (isChecked = event.value)"
    />
  </view>
  <!-- A third-party native view through the wrapper: the engine derives its events and tints -->
  <view class="section-tight">
    <text class="switch-label">
      {{ volumeLabel }}
    </text>
    <Slider
      v-model="volume"
      :minimum-value="0"
      :maximum-value="1"
      :step="0.01"
      :minimum-track-tint-color="COLOR"
      :maximum-track-tint-color="TRACK_OFF"
      thumb-tint-color="#ffffff"
      class="slider"
    />
  </view>
</template>
