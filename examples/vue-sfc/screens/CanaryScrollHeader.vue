<script setup lang="ts">
import { Animated } from '@symbiote-native/vue';
import ActionButton from '../components/ActionButton.vue';
import { FREEZE_MS } from './canary-shared';

const FADE_RANGE = [0, 120];
const FREEZE_COLOR = '#fc8181';
const rows = Array.from({ length: 6 }, (_value, index) => index);

const scrollY = new Animated.Value(0);
const opacity = scrollY.interpolate({ inputRange: FADE_RANGE, outputRange: [1, 0.12], extrapolate: 'clamp' });
const translateY = scrollY.interpolate({ inputRange: FADE_RANGE, outputRange: [0, -16], extrapolate: 'clamp' });
const headerStyle = { opacity, transform: [{ translateY }] };
const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true });

function freezeJsThread(): void {
  const until = Date.now() + FREEZE_MS;
  while (Date.now() < until) {
    // Blocks on purpose: motion during the freeze can only come from the native driver
  }
}
</script>

<template>
  <!-- PASS: dragging the box fades and lifts the bar on the UI thread, with no per-frame JS -->
  <Animated.View
    class="parity-header"
    :style="headerStyle"
  >
    <text class="parity-header-text"> HEADER — fades as you scroll ↓ </text>
  </Animated.View>
  <Animated.ScrollView
    class="box-list160"
    nested-scroll-enabled
    :scroll-event-throttle="16"
    @scroll="onScroll"
  >
    <view
      v-for="i in rows"
      :key="i"
      class="scroll-demo-row"
    >
      <text class="list-row-text">
        {{ `scroll me · row ${i}` }}
      </text>
    </view>
  </Animated.ScrollView>
  <text class="tiny-center">
    ↑ drag inside the box — the bar above reacts
  </text>
  <ActionButton
    title="Freeze JS 3s — then scroll the box ↑"
    :color="FREEZE_COLOR"
    @press="freezeJsThread"
  />
  <text class="tiny-center">
    tap Freeze, then immediately drag the box — bar should still move
  </text>
</template>
