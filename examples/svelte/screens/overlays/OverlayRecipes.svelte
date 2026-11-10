<script lang="ts">
  import {
    ScreenContainer,
    useRoute,
    useStackNavigation,
  } from '@symbiote-native/navigation/svelte';
  import { resolveScreenContainerViewName } from '@symbiote-native/navigation';
  import { Platform } from '@symbiote-native/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { ROUTE_NAME } from '../../routes';
  import { readIsModal } from '../read-params';
  import { toastStore } from './use-toast';

  type IOverlayRecipesProps = {
    isOverlayModal: boolean;
    onOverlayModalChange: (value: boolean) => void;
  };

  const COLOR = LINE_COLOR.structure;
  const toastRecipe = recipeById('overlays-toast');
  const voiceOverRecipe = recipeById('overlays-voiceover');
  const containerRecipe = recipeById('overlays-container');

  // Recipes for the toast: the screen below draws it, the modal on top only asks for it
  // The container recipe holds a bare container with the two switches it takes
  let { isOverlayModal, onOverlayModalChange }: IOverlayRecipesProps = $props();
  const route = useRoute();
  const navigation = useStackNavigation();
  let isEnabled = $state(true);
  let hasTwoStates = $state(false);
  const viewName = $derived(
    resolveScreenContainerViewName({
      enabled: isEnabled,
      hasTwoStates,
      os: Platform.OS,
    }),
  );
</script>

<Recipe recipe={toastRecipe}>
  {#if readIsModal(route.current.params)}
    <!-- The amber toast is drawn by the screen below and the mint one by the overlay -->
    <text class="info-text">
      This is the modal. Ask for each toast and see which one rises above it.
    </text>
    <ActionButton
      testID="overlays-toast-tree"
      title="Toast in the screen below (amber)"
      onPress={() => toastStore.show('tree')}
      color={COLOR}
    />
    <ActionButton
      testID="overlays-toast-overlay"
      title="Toast in a FullWindowOverlay (mint)"
      onPress={() => toastStore.show('overlay')}
      color={COLOR}
    />
  {:else}
    <!-- Under no modal both toasts look the same, so the screen below only offers the way in -->
    <text class="info-text">
      This is the screen below the modal, the toast buttons wait in the modal.
    </text>
    <ActionButton
      testID="overlays-open-modal"
      title="Open the modal"
      onPress={() =>
        navigation.current.push(ROUTE_NAME.OverlayContainers, {
          isModal: true,
        })}
      color={COLOR}
    />
  {/if}
</Recipe>
<Recipe recipe={voiceOverRecipe}>
  <SwitchRow
    testID="overlays-voiceover"
    label="Overlay is modal for VoiceOver"
    value={isOverlayModal}
    onChange={onOverlayModalChange}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={containerRecipe}>
  <SwitchRow
    testID="overlays-container-enabled"
    label="enabled"
    value={isEnabled}
    onChange={value => (isEnabled = value)}
    color={COLOR}
  />
  <SwitchRow
    testID="overlays-container-two-states"
    label="hasTwoStates"
    value={hasTwoStates}
    onChange={value => (hasTwoStates = value)}
    color={COLOR}
  />
  <text testID="overlays-container-view" class="info-text">
    {`native view here: ${viewName}`}
  </text>
  <ScreenContainer enabled={isEnabled} {hasTwoStates} />
</Recipe>
