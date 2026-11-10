<!-- Recipes for the swipe itself: whether it works, where it starts and which way it goes -->
<script setup lang="ts">
import ChoiceRow from '../../components/ChoiceRow.vue';
import Recipe from '../../components/Recipe.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { SWIPE_AREAS, SWIPE_DIRECTIONS } from './gestures-settings';
import { useGestures } from './use-gestures';

const COLOR = LINE_COLOR.presentation;
const enabledRecipe = recipeById('gestures-enabled');
const fullScreenRecipe = recipeById('gestures-full-screen');
const areaRecipe = recipeById('gestures-area');
const directionRecipe = recipeById('gestures-direction');
const keyboardRecipe = recipeById('gestures-keyboard');

const { settings, update } = useGestures();
</script>

<template>
  <Recipe :recipe="enabledRecipe">
    <SwitchRow
      testID="gestures-enabled"
      label="gestureEnabled"
      :value="settings.isGestureEnabled"
      :onChange="isGestureEnabled => update({ isGestureEnabled })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="fullScreenRecipe">
    <SwitchRow
      testID="gestures-full-screen"
      label="fullScreenSwipeEnabled"
      :value="settings.isFullScreenSwipe"
      :onChange="isFullScreenSwipe => update({ isFullScreenSwipe })"
      :color="COLOR"
    />
    <SwitchRow
      testID="gestures-full-screen-shadow"
      label="fullScreenSwipeShadowEnabled"
      :value="settings.isFullScreenShadow"
      :onChange="isFullScreenShadow => update({ isFullScreenShadow })"
      :color="COLOR"
    />
    <SwitchRow
      testID="gestures-custom-animation"
      label="customAnimationOnSwipe"
      :value="settings.isCustomAnimation"
      :onChange="isCustomAnimation => update({ isCustomAnimation })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="areaRecipe">
    <ChoiceRow
      testID="gestures-area"
      :value="settings.area"
      :options="SWIPE_AREAS"
      :onChange="area => update({ area })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="directionRecipe">
    <ChoiceRow
      testID="gestures-direction"
      :value="settings.swipeDirection"
      :options="SWIPE_DIRECTIONS"
      :onChange="swipeDirection => update({ swipeDirection })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="keyboardRecipe">
    <text-input
      testID="gestures-keyboard-input"
      placeholder="Focus me, then swipe back"
      placeholderTextColor="#41506a"
      class="text-input"
    />
    <SwitchRow
      testID="gestures-keyboard"
      label="hideKeyboardOnSwipe"
      :value="settings.isKeyboardHidden"
      :onChange="isKeyboardHidden => update({ isKeyboardHidden })"
      :color="COLOR"
    />
  </Recipe>
</template>
