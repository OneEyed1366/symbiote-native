<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { Animated } from '@symbiote-native/vue';

const PULSE_MS = 1_600;
const PULSE_INPUT = [0, 0.5, 1];

// Plain local, never a ref: a reactive Proxy would hide the node from the native driver
const pulse = new Animated.Value(0);

// Native driver, so an always-on pulse costs no per-frame JS
// The frames merge over the class style `routeProp` wrote, they never replace it
const heartbeat = Animated.loop(
  Animated.timing(pulse, {
    toValue: 1,
    duration: PULSE_MS,
    useNativeDriver: true,
  }),
);
onMounted(() => heartbeat.start());
onUnmounted(() => heartbeat.stop());

const pulseStyle = {
  opacity: pulse.interpolate({
    inputRange: PULSE_INPUT,
    outputRange: [1, 0.55, 1],
  }),
  transform: [
    {
      scale: pulse.interpolate({
        inputRange: PULSE_INPUT,
        outputRange: [1, 1.18, 1],
      }),
    },
  ],
};
</script>

<template>
  <view class="sc-panel">
    <text class="sc-panel-title"> 5 · An animation on top of a class </text>
    <text class="sc-panel-note">
      The class owns the whole static look; the Animated.Value writes only
      transform and opacity. If a frame clobbered the resolved class the tile
      would lose its ring and its corners mid-pulse rather than merely stop
      moving — the two are independent, and the ring is the tell.
    </text>
    <view class="sc-anim-frame">
      <Animated.View
        class="sc-anim-tile"
        testID="sc-anim-tile"
        :style="pulseStyle"
      >
        <text class="sc-anim-text"> class + frame </text>
      </Animated.View>
    </view>
  </view>
</template>
