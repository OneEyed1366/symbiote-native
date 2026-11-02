<!-- The toast recipe, the VoiceOver switch and the bare container recipe of the overlays demo -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ScreenContainer,
  useRoute,
  useStackNavigation,
} from '@symbiote-native/navigation/vue';
import { resolveScreenContainerViewName } from '@symbiote-native/navigation';
import { Platform } from '@symbiote-native/vue';
import ActionButton from '../../components/ActionButton.vue';
import Recipe from '../../components/Recipe.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';
import { readIsModal } from '../read-params';
import { toastStore } from './use-toast';

defineProps<{
  isOverlayModal: boolean;
  onOverlayModalChange: (value: boolean) => void;
}>();

const COLOR = LINE_COLOR.structure;
const toastRecipe = recipeById('overlays-toast');
const voiceOverRecipe = recipeById('overlays-voiceover');
const containerRecipe = recipeById('overlays-container');

const route = useRoute();
const navigation = useStackNavigation();
const isModal = computed(() => readIsModal(route.value.params));

// A bare container with the two switches it takes, and the native view they pick
const isEnabled = ref(true);
const hasTwoStates = ref(false);
const viewName = computed(() =>
  resolveScreenContainerViewName({
    enabled: isEnabled.value,
    hasTwoStates: hasTwoStates.value,
    os: Platform.OS,
  }),
);
</script>

<template>
  <Recipe :recipe="toastRecipe">
    <!-- The amber toast is drawn by the screen below and the mint one by the overlay -->
    <template v-if="isModal">
      <text class="info-text">
        This is the modal. Ask for each toast and see which one rises above it.
      </text>
      <ActionButton
        testID="overlays-toast-tree"
        title="Toast in the screen below (amber)"
        :onPress="() => toastStore.show('tree')"
        :color="COLOR"
      />
      <ActionButton
        testID="overlays-toast-overlay"
        title="Toast in a FullWindowOverlay (mint)"
        :onPress="() => toastStore.show('overlay')"
        :color="COLOR"
      />
    </template>
    <!-- Under no modal both toasts look the same, so the screen below only offers the way in -->
    <template v-else>
      <text class="info-text">
        This is the screen below the modal, the toast buttons wait in the modal.
      </text>
      <ActionButton
        testID="overlays-open-modal"
        title="Open the modal"
        :onPress="
          () => navigation.push(ROUTE_NAME.OverlayContainers, { isModal: true })
        "
        :color="COLOR"
      />
    </template>
  </Recipe>
  <Recipe :recipe="voiceOverRecipe">
    <SwitchRow
      testID="overlays-voiceover"
      label="Overlay is modal for VoiceOver"
      :value="isOverlayModal"
      :onChange="onOverlayModalChange"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="containerRecipe">
    <SwitchRow
      testID="overlays-container-enabled"
      label="enabled"
      :value="isEnabled"
      :onChange="value => (isEnabled = value)"
      :color="COLOR"
    />
    <SwitchRow
      testID="overlays-container-two-states"
      label="hasTwoStates"
      :value="hasTwoStates"
      :onChange="value => (hasTwoStates = value)"
      :color="COLOR"
    />
    <text testID="overlays-container-view" class="info-text">
      {{ `native view here: ${viewName}` }}
    </text>
    <ScreenContainer :enabled="isEnabled" :has-two-states="hasTwoStates" />
  </Recipe>
</template>
