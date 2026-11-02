<!-- Recipes for the options of one tab, each tab is one native screen of the bar -->
<script setup lang="ts">
import { useTabNavigation } from '@symbiote-native/navigation/vue';
import ActionButton from '../../components/ActionButton.vue';
import ChoiceRow from '../../components/ChoiceRow.vue';
import Recipe from '../../components/Recipe.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { BADGE_OPTIONS, useNativeTabsDemo } from './native-tabs-demo';

const COLOR = LINE_COLOR.structure;
const badgeRecipe = recipeById('native-tabs-badge');
const preventRecipe = recipeById('native-tabs-prevent');
const retapRecipe = recipeById('native-tabs-retap');
const searchRecipe = recipeById('native-tabs-search');
const iconsRecipe = recipeById('native-tabs-icons');

const { settings, update } = useNativeTabsDemo();
const navigation = useTabNavigation();
</script>

<template>
  <Recipe :recipe="badgeRecipe">
    <ChoiceRow
      testID="native-tabs-badge"
      :value="settings.badge"
      :options="BADGE_OPTIONS"
      :onChange="badge => update({ badge })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="preventRecipe">
    <SwitchRow
      testID="native-tabs-locked"
      label="preventNativeSelection on Locked"
      :value="settings.isLocked"
      :onChange="isLocked => update({ isLocked })"
      :color="COLOR"
    />
    <ActionButton
      testID="native-tabs-open-locked"
      title="Open Locked with jumpTo"
      :onPress="() => navigation.jumpTo('Locked')"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="retapRecipe">
    <SwitchRow
      testID="native-tabs-scroll-to-top"
      label="scrollToTop on Feed"
      :value="settings.isScrollToTop"
      :onChange="isScrollToTop => update({ isScrollToTop })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="searchRecipe">
    <text class="info-text">
      The Search tab at the end of the bar carries the role.
    </text>
  </Recipe>
  <Recipe :recipe="iconsRecipe">
    <text class="info-text">
      Config, Feed, Inbox, Locked and Search each set an SF Symbol and a filled
      one for the selected state.
    </text>
  </Recipe>
</template>
