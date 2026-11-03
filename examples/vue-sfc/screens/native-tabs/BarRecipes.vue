<!-- Recipes for the options of the whole bar, the host of the native tabs -->
<script setup lang="ts">
import ChoiceRow from '../../components/ChoiceRow.vue';
import Recipe from '../../components/Recipe.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import {
  CONTROLLER_MODE_OPTIONS,
  DIRECTION_OPTIONS,
  MINIMIZE_OPTIONS,
  SCHEME_OPTIONS,
  SIDEBAR_PLACEMENT_OPTIONS,
  useNativeTabsDemo,
} from './native-tabs-demo';

const COLOR = LINE_COLOR.structure;
const hiddenRecipe = recipeById('native-tabs-hidden');
const minimizeRecipe = recipeById('native-tabs-minimize');
const accessoryRecipe = recipeById('native-tabs-accessory');
const modeRecipe = recipeById('native-tabs-controller-mode');
const schemeRecipe = recipeById('native-tabs-scheme');

const { settings, update } = useNativeTabsDemo();
</script>

<template>
  <Recipe :recipe="hiddenRecipe">
    <SwitchRow
      testID="native-tabs-hidden"
      label="tabBarHidden"
      :value="settings.isBarHidden"
      :onChange="isBarHidden => update({ isBarHidden })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="minimizeRecipe">
    <ChoiceRow
      testID="native-tabs-minimize"
      :value="settings.minimize"
      :options="MINIMIZE_OPTIONS"
      :onChange="minimize => update({ minimize })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="accessoryRecipe">
    <SwitchRow
      testID="native-tabs-accessory"
      label="bottomAccessory visible"
      :value="settings.isAccessoryShown"
      :onChange="isAccessoryShown => update({ isAccessoryShown })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="modeRecipe">
    <ChoiceRow
      testID="native-tabs-mode"
      :value="settings.controllerMode"
      :options="CONTROLLER_MODE_OPTIONS"
      :onChange="controllerMode => update({ controllerMode })"
      :color="COLOR"
    />
    <ChoiceRow
      testID="native-tabs-placement"
      :value="settings.sidebarPlacement"
      :options="SIDEBAR_PLACEMENT_OPTIONS"
      :onChange="sidebarPlacement => update({ sidebarPlacement })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="schemeRecipe">
    <ChoiceRow
      testID="native-tabs-scheme"
      :value="settings.scheme"
      :options="SCHEME_OPTIONS"
      :onChange="scheme => update({ scheme })"
      :color="COLOR"
    />
    <ChoiceRow
      testID="native-tabs-direction"
      :value="settings.direction"
      :options="DIRECTION_OPTIONS"
      :onChange="direction => update({ direction })"
      :color="COLOR"
    />
    <SwitchRow
      testID="native-tabs-tint"
      label="tabBarTintColor"
      :value="settings.isTinted"
      :onChange="isTinted => update({ isTinted })"
      :color="COLOR"
    />
  </Recipe>
</template>
