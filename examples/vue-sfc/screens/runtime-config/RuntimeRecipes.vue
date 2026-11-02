<!-- The global switches of the screens library, read live: nothing here is a copy -->
<script setup lang="ts">
import { onScopeDispose, ref } from 'vue';
import {
  compatibilityFlags,
  enableScreens,
  featureFlags,
  isSearchBarAvailableForCurrentPlatform,
  screensEnabled,
  useRoute,
  useStackNavigation,
} from '@symbiote-native/navigation/vue';
import { resolveScreenContainerViewName } from '@symbiote-native/navigation';
import { Platform } from '@symbiote-native/vue';
import Recipe from '../../components/Recipe.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { configRows, readIsLegacyInset } from './runtime-config';
import type { IConfigRow } from './runtime-config';

const COLOR = LINE_COLOR.introspection;
const enableRecipe = recipeById('runtime-enable-screens');
const featureRecipe = recipeById('runtime-feature-flags');
const compatRecipe = recipeById('runtime-compat-flags');
const searchRecipe = recipeById('runtime-search-bar');
const legacyRecipe = recipeById('runtime-legacy-inset');
const backRecipe = recipeById('runtime-native-back');
const SEARCH_BAR_ROW = 'isSearchBarAvailableForCurrentPlatform';

function rowsOfGroups(groups: readonly IConfigRow['group'][]) {
  return configRows({
    experiment: featureFlags.experiment,
    stable: featureFlags.stable,
    compatibility: compatibilityFlags,
    isSearchBarAvailable: isSearchBarAvailableForCurrentPlatform,
    areScreensEnabled: screensEnabled(),
  }).filter(row => groups.includes(row.group));
}

function searchRows() {
  return rowsOfGroups(['platform']).filter(row => row.name === SEARCH_BAR_ROW);
}

const initial = screensEnabled();
const areScreensOn = ref(initial);
// The switch is app-wide, so leaving the screen puts the value it found back
onScopeDispose(() => enableScreens(initial));
const viewName = resolveScreenContainerViewName({
  hasTwoStates: false,
  os: Platform.OS,
});

function setScreensEnabled(value: boolean) {
  enableScreens(value);
  areScreensOn.value = value;
}

const route = useRoute();
const navigation = useStackNavigation();
</script>

<template>
  <Recipe :recipe="enableRecipe">
    <SwitchRow
      testID="runtime-enable-screens"
      label="enableScreens"
      :value="areScreensOn"
      :onChange="setScreensEnabled"
      :color="COLOR"
    />
    <text testID="runtime-container-view" class="info-text">
      {{ `a container without enabled draws: ${viewName}` }}
    </text>
  </Recipe>
  <Recipe :recipe="featureRecipe">
    <view
      v-for="row in rowsOfGroups(['experiment', 'stable'])"
      :key="row.name"
      :testID="`runtime-row-${row.name}`"
    >
      <text class="list-row-text">{{ `${row.name}: ${row.value}` }}</text>
      <text class="info-text">{{ row.note }}</text>
    </view>
  </Recipe>
  <Recipe :recipe="compatRecipe">
    <view
      v-for="row in rowsOfGroups(['compatibility'])"
      :key="row.name"
      :testID="`runtime-row-${row.name}`"
    >
      <text class="list-row-text">{{ `${row.name}: ${row.value}` }}</text>
      <text class="info-text">{{ row.note }}</text>
    </view>
  </Recipe>
  <Recipe :recipe="searchRecipe">
    <view
      v-for="row in searchRows()"
      :key="row.name"
      :testID="`runtime-row-${row.name}`"
    >
      <text class="list-row-text">{{ `${row.name}: ${row.value}` }}</text>
      <text class="info-text">{{ row.note }}</text>
    </view>
  </Recipe>
  <Recipe :recipe="legacyRecipe">
    <SwitchRow
      testID="runtime-legacy-inset"
      label="headerLegacyTopInsetBehavior"
      :value="readIsLegacyInset(route.params)"
      :onChange="isOn => navigation.setParams({ isLegacyInset: isOn })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="backRecipe">
    <text class="info-text">executeNativeBackPress() has no button here.</text>
  </Recipe>
</template>
