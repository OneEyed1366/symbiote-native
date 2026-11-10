<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from '@symbiote-native/navigation/vue';
import LabeledChoice from '../../components/LabeledChoice.vue';
import Recipe from '../../components/Recipe.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { isParamsRecord, readText } from '../read-params';
import { useRouteSettings } from '../use-route-settings';
import {
  ITEM_KINDS,
  readHeaderOptionsSettings,
} from './header-options-settings';

const COLOR = LINE_COLOR.presentation;
const largeTitleRecipe = recipeById('header-options-large-title');
const barItemsRecipe = recipeById('header-options-bar-items');

const { settings, update } = useRouteSettings(readHeaderOptionsSettings);

// What the last bar button or menu entry reported, kept in the route params by the resolver
const route = useRoute();
const lastAction = computed(() => {
  const { params } = route.value;
  return isParamsRecord(params) ? readText(params, 'lastHeaderAction', '') : '';
});
</script>

<template>
  <Recipe :recipe="largeTitleRecipe">
    <SwitchRow
      testID="header-large-title"
      label="headerLargeTitle"
      :value="settings.isLargeTitle"
      :onChange="isLargeTitle => update({ isLargeTitle })"
      :color="COLOR"
    />
    <SwitchRow
      testID="header-translucent"
      label="headerTranslucent"
      :value="settings.isTranslucent"
      :onChange="isTranslucent => update({ isTranslucent })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="barItemsRecipe">
    <LabeledChoice
      testID="header-left-items"
      label="headerLeftBarButtonItems"
      :value="settings.leftItems"
      :options="ITEM_KINDS"
      :onChange="leftItems => update({ leftItems })"
      :color="COLOR"
    />
    <LabeledChoice
      testID="header-right-items"
      label="headerRightBarButtonItems"
      :value="settings.rightItems"
      :options="ITEM_KINDS"
      :onChange="rightItems => update({ rightItems })"
      :color="COLOR"
    />
    <SwitchRow
      testID="header-spaced"
      label="spacing item and a second button"
      :value="settings.isSpaced"
      :onChange="isSpaced => update({ isSpaced })"
      :color="COLOR"
    />
    <text testID="header-last-action" class="info-text">
      {{
        `last header action: ${lastAction || 'none yet, tap a bar button or menu item'}`
      }}
    </text>
  </Recipe>
</template>
