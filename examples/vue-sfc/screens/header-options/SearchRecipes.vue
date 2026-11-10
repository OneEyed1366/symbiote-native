<!-- Layout and event recipes of the search bar, as a .vue holds one component per file -->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from '@symbiote-native/navigation/vue';
import ActionButton from '../../components/ActionButton.vue';
import LabeledChoice from '../../components/LabeledChoice.vue';
import Recipe from '../../components/Recipe.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { isParamsRecord, readText } from '../read-params';
import { useRouteSettings } from '../use-route-settings';
import {
  AUTO_CAPITALIZE,
  CANCEL_TEXTS,
  COLOR_THEMES,
  INPUT_TYPES,
  PLACEMENTS,
  readHeaderOptionsSettings,
} from './header-options-settings';
import { searchBarRef } from './search-bar-ref';

const COLOR = LINE_COLOR.presentation;
const placementRecipe = recipeById('header-options-placement');
const behaviorRecipe = recipeById('header-options-search-behavior');
const colorsRecipe = recipeById('header-options-search-colors');
const androidRecipe = recipeById('header-options-android');
const eventsRecipe = recipeById('header-options-search-events');
const commandsRecipe = recipeById('header-options-search-commands');
const PRESET_TEXT = 'preset value';

const { settings, update } = useRouteSettings(readHeaderOptionsSettings);

// The callbacks the resolver wires write to the route params, the buttons drive the ref
const route = useRoute();
const last = computed(() => {
  const { params } = route.value;
  const record = isParamsRecord(params) ? params : {};
  return {
    text: readText(record, 'lastSearchText', ''),
    submitted: readText(record, 'lastSearchSubmitted', ''),
    event: readText(record, 'lastSearchBarEvent', ''),
  };
});
</script>

<template>
  <Recipe :recipe="placementRecipe">
    <LabeledChoice
      testID="search-placement"
      label="placement"
      :value="settings.placement"
      :options="PLACEMENTS"
      :onChange="placement => update({ placement })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="behaviorRecipe">
    <SwitchRow
      testID="search-hide-when-scrolling"
      label="hideWhenScrolling"
      :value="settings.isHideWhenScrolling"
      :onChange="isHideWhenScrolling => update({ isHideWhenScrolling })"
      :color="COLOR"
    />
    <SwitchRow
      testID="search-obscure-background"
      label="obscureBackground"
      :value="settings.isObscureBackground"
      :onChange="isObscureBackground => update({ isObscureBackground })"
      :color="COLOR"
    />
    <SwitchRow
      testID="search-hide-navigation-bar"
      label="hideNavigationBar"
      :value="settings.isHideNavigationBar"
      :onChange="isHideNavigationBar => update({ isHideNavigationBar })"
      :color="COLOR"
    />
    <SwitchRow
      testID="search-auto-focus"
      label="autoFocus"
      :value="settings.isAutoFocus"
      :onChange="isAutoFocus => update({ isAutoFocus })"
      :color="COLOR"
    />
    <SwitchRow
      testID="search-toolbar-integration"
      label="allowToolbarIntegration"
      :value="settings.isAllowToolbarIntegration"
      :onChange="
        isAllowToolbarIntegration => update({ isAllowToolbarIntegration })
      "
      :color="COLOR"
    />
    <LabeledChoice
      testID="search-auto-capitalize"
      label="autoCapitalize"
      :value="settings.autoCapitalize"
      :options="AUTO_CAPITALIZE"
      :onChange="autoCapitalize => update({ autoCapitalize })"
      :color="COLOR"
    />
    <LabeledChoice
      testID="search-cancel-text"
      label="cancelButtonText"
      :value="settings.cancelText"
      :options="CANCEL_TEXTS"
      :onChange="cancelText => update({ cancelText })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="colorsRecipe">
    <LabeledChoice
      testID="search-color-theme"
      label="colour theme of the field"
      :value="settings.colorTheme"
      :options="COLOR_THEMES"
      :onChange="colorTheme => update({ colorTheme })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="androidRecipe">
    <LabeledChoice
      testID="search-input-type"
      label="inputType"
      :value="settings.inputType"
      :options="INPUT_TYPES"
      :onChange="inputType => update({ inputType })"
      :color="COLOR"
    />
    <SwitchRow
      testID="search-hint-icon"
      label="shouldShowHintSearchIcon"
      :value="settings.isShowHintSearchIcon"
      :onChange="isShowHintSearchIcon => update({ isShowHintSearchIcon })"
      :color="COLOR"
    />
    <SwitchRow
      testID="search-back-override"
      label="disableBackButtonOverride"
      :value="settings.isDisableBackButtonOverride"
      :onChange="
        isDisableBackButtonOverride => update({ isDisableBackButtonOverride })
      "
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="eventsRecipe">
    <text testID="header-search-text" class="info-text">
      {{ `last search text: ${last.text || 'none yet, pull down and type'}` }}
    </text>
    <text testID="header-search-submitted" class="info-text">
      {{
        `last search submitted: ${last.submitted || 'none yet, type and press search'}`
      }}
    </text>
    <text testID="header-search-event" class="info-text">
      {{
        `last search bar event: ${last.event || 'none yet, focus or cancel the search bar'}`
      }}
    </text>
  </Recipe>
  <Recipe :recipe="commandsRecipe">
    <ActionButton
      testID="search-bar-focus"
      title="focus()"
      :onPress="() => searchBarRef?.focus()"
      :color="COLOR"
    />
    <ActionButton
      testID="search-bar-blur"
      title="blur()"
      :onPress="() => searchBarRef?.blur()"
      :color="COLOR"
    />
    <ActionButton
      testID="search-bar-set-text"
      :title="`setText('${PRESET_TEXT}')`"
      :onPress="() => searchBarRef?.setText(PRESET_TEXT)"
      :color="COLOR"
    />
    <ActionButton
      testID="search-bar-clear"
      title="clearText()"
      :onPress="() => searchBarRef?.clearText()"
      :color="COLOR"
    />
    <ActionButton
      testID="search-bar-cancel"
      title="cancelSearch()"
      :onPress="() => searchBarRef?.cancelSearch()"
      :color="COLOR"
    />
    <ActionButton
      testID="search-bar-show-cancel"
      title="toggleCancelButton(true)"
      :onPress="() => searchBarRef?.toggleCancelButton(true)"
      :color="COLOR"
    />
  </Recipe>
</template>
