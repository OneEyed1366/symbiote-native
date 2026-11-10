<!-- The drawer props are the panel, the Drawer above reads them on every render -->
<script setup lang="ts">
import { useDrawerNavigation } from '@symbiote-native/navigation/vue';
import ActionButton from '../../components/ActionButton.vue';
import LabeledChoice from '../../components/LabeledChoice.vue';
import Recipe from '../../components/Recipe.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { LINE_COLOR } from '../../navigation-lines';
import { recipeById } from '../../navigation-recipes';
import { useDrawerPanel } from './drawer-panel';
import {
  DISTANCE_CHOICES,
  DRAWER_POSITIONS,
  DRAWER_TYPES,
  EDGE_CHOICES,
  OVERLAY_CHOICES,
  VELOCITY_CHOICES,
  WIDTH_CHOICES,
} from './drawer-settings';

const COLOR = LINE_COLOR.structure;
const typeRecipe = recipeById('drawer-type');
const positionRecipe = recipeById('drawer-position');
const widthRecipe = recipeById('drawer-width');
const overlayRecipe = recipeById('drawer-overlay');
const swipeRecipe = recipeById('drawer-swipe');
const contentRecipe = recipeById('drawer-content');

const { settings, update } = useDrawerPanel();
const navigation = useDrawerNavigation();
</script>

<template>
  <Recipe :recipe="typeRecipe">
    <LabeledChoice
      testID="drawer-type"
      label="drawerType"
      :value="settings.drawerType"
      :options="DRAWER_TYPES"
      :onChange="drawerType => update({ drawerType })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="positionRecipe">
    <LabeledChoice
      testID="drawer-position"
      label="drawerPosition"
      :value="settings.drawerPosition"
      :options="DRAWER_POSITIONS"
      :onChange="drawerPosition => update({ drawerPosition })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="widthRecipe">
    <LabeledChoice
      testID="drawer-width"
      label="drawerWidth"
      :value="settings.width"
      :options="WIDTH_CHOICES"
      :onChange="width => update({ width })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="overlayRecipe">
    <LabeledChoice
      testID="drawer-overlay"
      label="overlayColor"
      :value="settings.overlay"
      :options="OVERLAY_CHOICES"
      :onChange="overlay => update({ overlay })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="swipeRecipe">
    <SwitchRow
      testID="drawer-swipe-enabled"
      label="swipeEnabled"
      :value="settings.isSwipeEnabled"
      :onChange="isSwipeEnabled => update({ isSwipeEnabled })"
      :color="COLOR"
    />
    <LabeledChoice
      testID="drawer-edge"
      label="swipeEdgeWidth"
      :value="settings.edge"
      :options="EDGE_CHOICES"
      :onChange="edge => update({ edge })"
      :color="COLOR"
    />
    <LabeledChoice
      testID="drawer-distance"
      label="swipeMinDistance"
      :value="settings.distance"
      :options="DISTANCE_CHOICES"
      :onChange="distance => update({ distance })"
      :color="COLOR"
    />
    <LabeledChoice
      testID="drawer-velocity"
      label="swipeMinVelocity"
      :value="settings.velocity"
      :options="VELOCITY_CHOICES"
      :onChange="velocity => update({ velocity })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="contentRecipe">
    <ActionButton
      testID="drawer-open"
      title="Open drawer"
      :onPress="() => navigation.openDrawer()"
      :color="COLOR"
    />
    <ActionButton
      testID="drawer-toggle"
      title="Toggle drawer"
      :onPress="() => navigation.toggleDrawer()"
      :color="COLOR"
    />
  </Recipe>
</template>
