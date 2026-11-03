<!-- Each recipe edits the panel, any "Present" button opens a sheet with all of it applied -->
<script setup lang="ts">
import { ref } from 'vue';
import ActionButton from '../../components/ActionButton.vue';
import LabeledChoice from '../../components/LabeledChoice.vue';
import Recipe from '../../components/Recipe.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { LINE_COLOR } from '../../navigation-lines';
import { recipeById } from '../../navigation-recipes';
import { ROUTE_NAME } from '../../routes';
import { useRouteSettings } from '../use-route-settings';
import {
  CONTENT_STYLES,
  DETENT_CHOICES,
  ELEVATION_CHOICES,
  INITIAL_CHOICES,
  RADIUS_CHOICES,
  readSheetSettings,
  sheetParamsOf,
  UNDIMMED_CHOICES,
} from './sheet-settings';
import { sheetLog, useSheetLines } from './use-sheet-log';

const COLOR = LINE_COLOR.presentation;
const detentsRecipe = recipeById('sheet-detents');
const initialRecipe = recipeById('sheet-initial');
const undimmedRecipe = recipeById('sheet-undimmed');
const grabberRecipe = recipeById('sheet-grabber');
const expandRecipe = recipeById('sheet-expand-scroll');
const contentRecipe = recipeById('sheet-content-style');
const eventsRecipe = recipeById('sheet-events');
const footerRecipe = recipeById('sheet-footer');
const androidRecipe = recipeById('sheet-android');
const stackingRecipe = recipeById('sheet-stacking');

const { settings, update, navigation } = useRouteSettings(readSheetSettings);
const lines = useSheetLines();

// The counter sits first on the screen: it is what stays tappable behind an undimmed sheet
const backgroundCount = ref(0);

function present() {
  navigation.value.push(ROUTE_NAME.SheetDemo, sheetParamsOf(settings.value));
}
</script>

<template>
  <ActionButton
    testID="sheet-background-counter"
    :title="`Background counter: ${backgroundCount}`"
    :onPress="() => backgroundCount++"
    :color="COLOR"
  />
  <Recipe :recipe="detentsRecipe">
    <LabeledChoice
      testID="sheet-detents"
      label="sheetAllowedDetents"
      :value="settings.detents"
      :options="DETENT_CHOICES"
      :onChange="detents => update({ detents })"
      :color="COLOR"
    />
    <ActionButton
      testID="sheet-present"
      title="Present a sheet"
      :onPress="present"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="initialRecipe">
    <LabeledChoice
      testID="sheet-initial"
      label="sheetInitialDetentIndex"
      :value="settings.initialDetent"
      :options="INITIAL_CHOICES"
      :onChange="initialDetent => update({ initialDetent })"
      :color="COLOR"
    />
    <ActionButton
      testID="sheet-present-initial"
      title="Present a sheet"
      :onPress="present"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="undimmedRecipe">
    <LabeledChoice
      testID="sheet-undimmed"
      label="sheetLargestUndimmedDetentIndex"
      :value="settings.undimmed"
      :options="UNDIMMED_CHOICES"
      :onChange="undimmed => update({ undimmed })"
      :color="COLOR"
    />
    <ActionButton
      testID="sheet-present-undimmed"
      title="Present a sheet"
      :onPress="present"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="grabberRecipe">
    <SwitchRow
      testID="sheet-grabber"
      label="sheetGrabberVisible"
      :value="settings.isGrabberVisible"
      :onChange="isGrabberVisible => update({ isGrabberVisible })"
      :color="COLOR"
    />
    <LabeledChoice
      testID="sheet-radius"
      label="sheetCornerRadius"
      :value="settings.cornerRadius"
      :options="RADIUS_CHOICES"
      :onChange="cornerRadius => update({ cornerRadius })"
      :color="COLOR"
    />
    <ActionButton
      testID="sheet-present-grabber"
      title="Present a sheet"
      :onPress="present"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="expandRecipe">
    <SwitchRow
      testID="sheet-expand"
      label="sheetExpandsWhenScrolledToEdge"
      :value="settings.isExpandsOnScroll"
      :onChange="isExpandsOnScroll => update({ isExpandsOnScroll })"
      :color="COLOR"
    />
    <ActionButton
      testID="sheet-present-expand"
      title="Present a sheet"
      :onPress="present"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="contentRecipe">
    <LabeledChoice
      testID="sheet-content-style"
      label="contentStyle"
      :value="settings.contentStyle"
      :options="CONTENT_STYLES"
      :onChange="contentStyle => update({ contentStyle })"
      :color="COLOR"
    />
    <ActionButton
      testID="sheet-present-content"
      title="Present a sheet"
      :onPress="present"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="eventsRecipe">
    <text v-if="lines.length === 0" class="info-text">
      No sheet event yet, present a sheet and drag it
    </text>
    <text
      v-for="(line, index) in lines"
      v-else
      :key="line.id"
      :testID="`sheet-log-line-${index}`"
      class="list-row-text"
    >
      {{ line.count > 1 ? `${line.text} x${line.count}` : line.text }}
    </text>
    <ActionButton
      testID="sheet-log-clear"
      title="Clear log"
      :onPress="sheetLog.clear"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="footerRecipe">
    <SwitchRow
      testID="sheet-footer"
      label="sheetFooter"
      :value="settings.hasFooter"
      :onChange="hasFooter => update({ hasFooter })"
      :color="COLOR"
    />
    <ActionButton
      testID="sheet-present-footer"
      title="Present a sheet"
      :onPress="present"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="androidRecipe">
    <LabeledChoice
      testID="sheet-elevation"
      label="sheetElevation"
      :value="settings.elevation"
      :options="ELEVATION_CHOICES"
      :onChange="elevation => update({ elevation })"
      :color="COLOR"
    />
    <SwitchRow
      testID="sheet-overflow"
      label="sheetShouldOverflowTopInset"
      :value="settings.isOverflowTopInset"
      :onChange="isOverflowTopInset => update({ isOverflowTopInset })"
      :color="COLOR"
    />
    <SwitchRow
      testID="sheet-resize-animation"
      label="sheetDefaultResizeAnimationEnabled"
      :value="settings.isDefaultResizeAnimation"
      :onChange="isDefaultResizeAnimation => update({ isDefaultResizeAnimation })"
      :color="COLOR"
    />
    <ActionButton
      testID="sheet-present-android"
      title="Present a sheet"
      :onPress="present"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="stackingRecipe">
    <text class="info-text">
      Present a sheet, then use Present another sheet inside it.
    </text>
  </Recipe>
</template>
