<!-- Bar, counter and jump recipes of the tabs demo, as a .vue holds one component per file -->
<script setup lang="ts">
import { ref } from 'vue';
import { useTabNavigation } from '@symbiote-native/navigation/vue';
import ActionButton from '../../components/ActionButton.vue';
import LabeledChoice from '../../components/LabeledChoice.vue';
import Recipe from '../../components/Recipe.vue';
import { LINE_COLOR } from '../../navigation-lines';
import { recipeById } from '../../navigation-recipes';
import { useTabsPanel } from './tabs-panel';
import {
  ACTIVE_CHOICES,
  BADGE_CHOICES,
  BAR_CHOICES,
  ICON_CHOICES,
  INACTIVE_CHOICES,
  LABEL_CHOICES,
  TAB_NAMES,
} from './tabs-settings';

const COLOR = LINE_COLOR.structure;
const HOME_TAB = 'Home';
const iconRecipe = recipeById('tabs-icon-badge');
const tintRecipe = recipeById('tabs-tint');
const barRecipe = recipeById('tabs-bar-style');
const labelRecipe = recipeById('tabs-label');
const resetRecipe = recipeById('tabs-state-reset');
const jumpRecipe = recipeById('tabs-jump');
const JUMP_TARGETS = TAB_NAMES.filter(name => name !== HOME_TAB);

const { settings, update } = useTabsPanel();
const tabs = useTabNavigation();

// One counter dies with its tab, the other lives in the panel above the `Tab`
const localCount = ref(0);
</script>

<template>
  <Recipe :recipe="iconRecipe">
    <LabeledChoice
      testID="tabs-icon"
      label="tabBarIcon"
      :value="settings.icon"
      :options="ICON_CHOICES"
      :onChange="icon => update({ icon })"
      :color="COLOR"
    />
    <LabeledChoice
      testID="tabs-badge"
      label="tabBarBadge on Search"
      :value="settings.badge"
      :options="BADGE_CHOICES"
      :onChange="badge => update({ badge })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="tintRecipe">
    <LabeledChoice
      testID="tabs-active"
      label="tabBarActiveTintColor"
      :value="settings.activeTint"
      :options="ACTIVE_CHOICES"
      :onChange="activeTint => update({ activeTint })"
      :color="COLOR"
    />
    <LabeledChoice
      testID="tabs-inactive"
      label="tabBarInactiveTintColor"
      :value="settings.inactiveTint"
      :options="INACTIVE_CHOICES"
      :onChange="inactiveTint => update({ inactiveTint })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="barRecipe">
    <LabeledChoice
      testID="tabs-bar"
      label="tabBarStyle"
      :value="settings.bar"
      :options="BAR_CHOICES"
      :onChange="bar => update({ bar })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="labelRecipe">
    <LabeledChoice
      testID="tabs-label"
      label="what names the tab"
      :value="settings.label"
      :options="LABEL_CHOICES"
      :onChange="label => update({ label })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="resetRecipe">
    <ActionButton
      testID="tabs-local-count"
      :title="`Local counter: ${localCount}`"
      :onPress="() => localCount++"
      :color="COLOR"
    />
    <ActionButton
      testID="tabs-lifted-count"
      :title="`Counter above the Tab: ${settings.liftedCount}`"
      :onPress="() => update({ liftedCount: settings.liftedCount + 1 })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="jumpRecipe">
    <LabeledChoice
      testID="tabs-initial"
      label="initialRouteName (remounts the bar)"
      :value="settings.initial"
      :options="TAB_NAMES"
      :onChange="initial => update({ initial })"
      :color="COLOR"
    />
    <ActionButton
      v-for="name in JUMP_TARGETS"
      :key="name"
      :testID="`tabs-jump-${name}`"
      :title="`jumpTo ${name} with a param`"
      :onPress="() => tabs.jumpTo(name, { from: HOME_TAB })"
      :color="COLOR"
    />
  </Recipe>
</template>
