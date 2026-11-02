import { computed, defineComponent, ref } from 'vue';
import {
  ScreenContainer,
  useRoute,
  useStackNavigation,
} from '@symbiote-native/navigation/vue';
import { resolveScreenContainerViewName } from '@symbiote-native/navigation';
import { Platform } from '@symbiote-native/vue';
import { ActionButton } from '../../components/ActionButton';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';
import { readIsModal } from '../read-params';
import { toastStore } from './use-toast';

const COLOR = LINE_COLOR.structure;
const toastRecipe = recipeById('overlays-toast');
const voiceOverRecipe = recipeById('overlays-voiceover');
const containerRecipe = recipeById('overlays-container');

// Under no modal both toasts look the same, so the screen below only offers the way in
const OpenModalButton = defineComponent(
  () => {
    const navigation = useStackNavigation();
    return () => (
      <>
        <text class="info-text">
          This is the screen below the modal, the toast buttons wait in the modal.
        </text>
        <ActionButton
          testID="overlays-open-modal"
          title="Open the modal"
          onPress={() =>
            navigation.value.push(ROUTE_NAME.OverlayContainers, {
              isModal: true,
            })
          }
          color={COLOR}
        />
      </>
    );
  },
  { name: 'OpenModalButton' },
);

// The amber toast is drawn by the screen below and the mint one by the overlay
function ToastButtons() {
  return (
    <>
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
    </>
  );
}

// Recipes for the toast: the screen below draws it, the modal on top only asks for it
export const ToastRecipes = defineComponent(
  (props: {
    isOverlayModal: boolean;
    onOverlayModalChange: (value: boolean) => void;
  }) => {
    const route = useRoute();
    return () => (
      <>
        <Recipe recipe={toastRecipe}>
          {readIsModal(route.value.params) ? <ToastButtons /> : <OpenModalButton />}
        </Recipe>
        <Recipe recipe={voiceOverRecipe}>
          <SwitchRow
            testID="overlays-voiceover"
            label="Overlay is modal for VoiceOver"
            value={props.isOverlayModal}
            onChange={props.onOverlayModalChange}
            color={COLOR}
          />
        </Recipe>
      </>
    );
  },
  { name: 'ToastRecipes', props: ['isOverlayModal', 'onOverlayModalChange'] },
);

// A bare container with the two switches it takes, and the native view they pick
export const ContainerRecipe = defineComponent(
  () => {
    const isEnabled = ref(true);
    const hasTwoStates = ref(false);
    const viewName = computed(() =>
      resolveScreenContainerViewName({
        enabled: isEnabled.value,
        hasTwoStates: hasTwoStates.value,
        os: Platform.OS,
      }),
    );
    return () => (
      <Recipe recipe={containerRecipe}>
        <SwitchRow
          testID="overlays-container-enabled"
          label="enabled"
          value={isEnabled.value}
          onChange={value => {
            isEnabled.value = value;
          }}
          color={COLOR}
        />
        <SwitchRow
          testID="overlays-container-two-states"
          label="hasTwoStates"
          value={hasTwoStates.value}
          onChange={value => {
            hasTwoStates.value = value;
          }}
          color={COLOR}
        />
        <text testID="overlays-container-view" class="info-text">
          {`native view here: ${viewName.value}`}
        </text>
        <ScreenContainer
          enabled={isEnabled.value}
          hasTwoStates={hasTwoStates.value}
        />
      </Recipe>
    );
  },
  { name: 'ContainerRecipe' },
);
