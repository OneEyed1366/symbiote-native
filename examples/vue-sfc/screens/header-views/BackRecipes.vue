<!-- Recipes for the back button: its text, whether it shows and what its arrow looks like -->
<script setup lang="ts">
import ChoiceRow from '../../components/ChoiceRow.vue';
import Recipe from '../../components/Recipe.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { BACK_DISPLAY_MODES, BACK_TITLES } from './header-views-settings';
import { useHeaderViews } from './use-header-views';

const COLOR = LINE_COLOR.presentation;
const titleRecipe = recipeById('header-views-back-title');
const visibleRecipe = recipeById('header-views-back-visible');
const imageRecipe = recipeById('header-views-back-image');

const { settings, update } = useHeaderViews();
</script>

<template>
  <Recipe :recipe="titleRecipe">
    <ChoiceRow
      testID="header-views-back-title"
      :value="settings.backTitle"
      :options="BACK_TITLES"
      :onChange="backTitle => update({ backTitle })"
      :color="COLOR"
    />
    <ChoiceRow
      testID="header-views-back-mode"
      :value="settings.backDisplayMode"
      :options="BACK_DISPLAY_MODES"
      :onChange="backDisplayMode => update({ backDisplayMode })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="visibleRecipe">
    <SwitchRow
      testID="header-views-back-visible"
      label="headerBackVisible"
      :value="settings.isBackVisible"
      :onChange="isBackVisible => update({ isBackVisible })"
      :color="COLOR"
    />
    <SwitchRow
      testID="header-views-back-menu"
      label="headerBackButtonMenuEnabled"
      :value="settings.isBackMenuEnabled"
      :onChange="isBackMenuEnabled => update({ isBackMenuEnabled })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="imageRecipe">
    <SwitchRow
      testID="header-views-back-image"
      label="headerBackImageSource"
      :value="settings.isBackImageCustom"
      :onChange="isBackImageCustom => update({ isBackImageCustom })"
      :color="COLOR"
    />
  </Recipe>
</template>
