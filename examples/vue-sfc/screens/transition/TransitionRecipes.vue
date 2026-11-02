<!-- Everything animated here is a native driven value, a swipe back redraws it without JS -->
<script setup lang="ts">
import { computed } from 'vue';
import { Animated } from '@symbiote-native/vue';
import {
  useStackNavigation,
  useTransitionProgress,
} from '@symbiote-native/navigation/vue';
import ActionButton from '../../components/ActionButton.vue';
import Recipe from '../../components/Recipe.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';
import { useRouteSettings } from '../use-route-settings';
import { readTransitionSettings } from './transition-settings';
import { useTransitionReadout } from './use-transition-readout';

const AnimatedView = Animated.View;

const COLOR = LINE_COLOR.introspection;
const FADE_FROM = 0.2;
const SCALE_FROM = 0.85;
const progressRecipe = recipeById('transition-progress-hook');
const flagsRecipe = recipeById('transition-flags');
const readoutRecipe = recipeById('transition-readout');
const heightRecipe = recipeById('transition-header-height');

const { progress, closing, goingForward } = useTransitionProgress();
const opacity = progress.interpolate({
  inputRange: [0, 1],
  outputRange: [FADE_FROM, 1],
  extrapolate: 'clamp',
});
const scale = progress.interpolate({
  inputRange: [0, 1],
  outputRange: [SCALE_FROM, 1],
  extrapolate: 'clamp',
});
const lamps = [
  { testID: 'transition-closing', label: 'closing', value: closing },
  { testID: 'transition-going-forward', label: 'goingForward', value: goingForward },
];

const navigation = useStackNavigation();
const { settings, update } = useRouteSettings(readTransitionSettings);
const readout = useTransitionReadout();
const readoutText = computed(() => {
  const { transitions, direction, ticks } = readout.value;
  if (transitions === 0) return 'No transition has finished yet';
  return `${transitions} finished, the last one ${direction} in ${ticks} ticks`;
});
</script>

<template>
  <Recipe :recipe="progressRecipe">
    <AnimatedView
      testID="transition-card"
      class="transition-card"
      :style="{ opacity, transform: [{ scale }] }"
    >
      <text class="transition-card-text">I follow the progress value</text>
    </AnimatedView>
  </Recipe>
  <Recipe :recipe="flagsRecipe">
    <view class="lamp-row">
      <view
        v-for="lamp in lamps"
        :key="lamp.testID"
        :testID="lamp.testID"
        class="lamp"
      >
        <AnimatedView class="lamp-lit" :style="{ opacity: lamp.value }" />
        <text class="lamp-text">{{ lamp.label }}</text>
      </view>
    </view>
  </Recipe>
  <Recipe :recipe="readoutRecipe">
    <text testID="transition-readout" class="list-row-text">
      {{ readoutText }}
    </text>
    <ActionButton
      testID="transition-push"
      title="Push Details"
      :onPress="() => navigation.push(ROUTE_NAME.Details)"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="heightRecipe">
    <SwitchRow
      testID="transition-translucent"
      label="Translucent header"
      :value="settings.isTranslucent"
      :onChange="isTranslucent => update({ isTranslucent })"
      :color="COLOR"
    />
    <SwitchRow
      testID="transition-large-title"
      label="Large title"
      :value="settings.isLargeTitle"
      :onChange="isLargeTitle => update({ isLargeTitle })"
      :color="COLOR"
    />
    <view
      testID="transition-ruler"
      class="ruler"
      :style="{ height: readout.headerHeight ?? undefined }"
    >
      <text class="list-row-text">
        {{
          readout.headerHeight === null
            ? 'Header height not reported yet'
            : `Header height ${readout.headerHeight}`
        }}
      </text>
    </view>
  </Recipe>
</template>
