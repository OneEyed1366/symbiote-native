<!-- The bars around the screen: status bar, orientation, home indicator, Android navigation bar -->
<script setup lang="ts">
import LabeledChoice from '../../components/LabeledChoice.vue';
import Recipe from '../../components/Recipe.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { useRouteSettings } from '../use-route-settings';
import {
  readInsetsSettings,
  SCREEN_ORIENTATIONS,
  STATUS_BAR_ANIMATIONS,
  STATUS_BAR_STYLES,
} from './insets-settings';
import { IS_STATUS_BAR_SETTABLE } from './status-bar-support';

const COLOR = LINE_COLOR.presentation;
const styleRecipe = recipeById('insets-status-style');
const hiddenRecipe = recipeById('insets-status-hidden');
const orientationRecipe = recipeById('insets-orientation');
const indicatorRecipe = recipeById('insets-home-indicator');
const navigationBarRecipe = recipeById('insets-navigation-bar');
const NOT_SETTABLE_NOTE =
  'This app keeps UIViewControllerBasedStatusBarAppearance off for the React Native StatusBar demo, so on iOS this option would raise a red box. Turn the key on in Info.plist to try it.';

const { settings, update } = useRouteSettings(readInsetsSettings);
</script>

<template>
  <Recipe :recipe="styleRecipe">
    <LabeledChoice
      v-if="IS_STATUS_BAR_SETTABLE"
      testID="insets-status-style"
      label="statusBarStyle"
      :value="settings.statusBarStyle"
      :options="STATUS_BAR_STYLES"
      :onChange="statusBarStyle => update({ statusBarStyle })"
      :color="COLOR"
    />
    <text v-else class="info-text">{{ NOT_SETTABLE_NOTE }}</text>
  </Recipe>
  <Recipe :recipe="hiddenRecipe">
    <template v-if="IS_STATUS_BAR_SETTABLE">
      <SwitchRow
        testID="insets-status-hidden"
        label="statusBarHidden"
        :value="settings.isStatusBarHidden"
        :onChange="isStatusBarHidden => update({ isStatusBarHidden })"
        :color="COLOR"
      />
      <LabeledChoice
        testID="insets-status-animation"
        label="statusBarAnimation"
        :value="settings.statusBarAnimation"
        :options="STATUS_BAR_ANIMATIONS"
        :onChange="statusBarAnimation => update({ statusBarAnimation })"
        :color="COLOR"
      />
    </template>
    <text v-else class="info-text">{{ NOT_SETTABLE_NOTE }}</text>
  </Recipe>
  <Recipe :recipe="orientationRecipe">
    <LabeledChoice
      testID="insets-orientation"
      label="screenOrientation"
      :value="settings.screenOrientation"
      :options="SCREEN_ORIENTATIONS"
      :onChange="screenOrientation => update({ screenOrientation })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="indicatorRecipe">
    <SwitchRow
      testID="insets-home-indicator"
      label="homeIndicatorHidden"
      :value="settings.isHomeIndicatorHidden"
      :onChange="isHomeIndicatorHidden => update({ isHomeIndicatorHidden })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="navigationBarRecipe">
    <SwitchRow
      testID="insets-navigation-bar"
      label="navigationBarHidden"
      :value="settings.isNavigationBarHidden"
      :onChange="isNavigationBarHidden => update({ isNavigationBarHidden })"
      :color="COLOR"
    />
  </Recipe>
</template>
