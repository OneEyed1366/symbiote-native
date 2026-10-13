<script setup lang="ts">
import { computed, ref } from 'vue';
import Reanimated, { css } from '@symbiote-native/reanimated/vue';
import ActionButton from '../../components/ActionButton.vue';
import RaSection from './RaSection.vue';
import { NEXT_COLOR } from './constants';

const LIFT = -16;

// The same animation through the JS API: keyframes made once, a style that names them
const bounce = css.keyframes({
  from: { transform: [{ translateY: 0 }] },
  to: { transform: [{ translateY: LIFT }] },
});

const jsStyles = css.create({
  ball: {
    animationName: bounce,
    animationDuration: '600ms',
    animationDirection: 'alternate',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
});

// CSS animations, transitions and states from a stylesheet, and the same through a style object
// Keyframes live in keyframes.css and in sections.css, and are shared between them
const isLong = ref(false);
const ends = ref(0);
const barClass = computed(() =>
  isLong.value ? 'ra-bar ra-bar-long' : 'ra-bar ra-bar-short',
);
const endsNote = computed(() => `transitions ended: ${ends.value}`);

const countEnd = () => {
  ends.value += 1;
};
</script>

<template>
  <RaSection
    title="CSS"
    note="animation, transition, @keyframes across files, onCSS callbacks, :active and :focus"
  >
    <text class="ra-note">keyframes from another file, and from this one</text>
    <view class="ra-row">
      <view testID="ra-css-spinner" class="ra-spinner" />
      <view testID="ra-css-pulse" class="ra-pulse" />
      <Reanimated.View
        testID="ra-css-ball"
        class="ra-ball"
        :style="jsStyles.ball"
      />
    </view>

    <text class="ra-note">transition on the width, and a callback when it ends</text>
    <Reanimated.View
      testID="ra-css-bar"
      :class="barClass"
      :onCSSTransitionEnd="countEnd"
    />
    <text class="ra-note">{{ endsNote }}</text>
    <ActionButton
      testID="ra-css-toggle"
      title="toggle bar"
      :onPress="() => (isLong = !isLong)"
      :color="NEXT_COLOR"
    />

    <text class="ra-note">states of the node, served by Reanimated</text>
    <view testID="ra-css-press" class="ra-press">
      <text class="ra-press-text">press and hold</text>
    </view>
    <text-input testID="ra-css-field" class="ra-field" placeholder="focus me" />
  </RaSection>
</template>
