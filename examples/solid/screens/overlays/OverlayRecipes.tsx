import { createSignal, Show } from 'solid-js';
import {
  ScreenContainer,
  useRoute,
  useStackNavigation,
} from '@symbiote-native/navigation/solid';
import { resolveScreenContainerViewName } from '@symbiote-native/navigation';
import { Platform } from '@symbiote-native/solid';
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

type IToastRecipesProps = {
  isOverlayModal: boolean;
  onOverlayModalChange: (value: boolean) => void;
};

// Under no modal both toasts look the same, so the screen below only offers the way in
function OpenModalButton() {
  const navigation = useStackNavigation();
  return (
    <>
      <text class="info-text">
        This is the screen below the modal, the toast buttons wait in the modal.
      </text>
      <ActionButton
        testID="overlays-open-modal"
        title="Open the modal"
        onPress={() =>
          navigation().push(ROUTE_NAME.OverlayContainers, { isModal: true })
        }
        color={COLOR}
      />
    </>
  );
}

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
export function ToastRecipes(props: IToastRecipesProps) {
  const route = useRoute();
  return (
    <>
      <Recipe recipe={toastRecipe}>
        <Show when={readIsModal(route().params)} fallback={<OpenModalButton />}>
          <ToastButtons />
        </Show>
      </Recipe>
      <Recipe recipe={voiceOverRecipe}>
        <SwitchRow
          testID="overlays-voiceover"
          label="Overlay is modal for VoiceOver"
          value={props.isOverlayModal}
          onChange={value => props.onOverlayModalChange(value)}
          color={COLOR}
        />
      </Recipe>
    </>
  );
}

// A bare container with the two switches it takes, and the native view they pick
export function ContainerRecipe() {
  const [isEnabled, setIsEnabled] = createSignal(true);
  const [hasTwoStates, setHasTwoStates] = createSignal(false);
  const viewName = () =>
    resolveScreenContainerViewName({
      enabled: isEnabled(),
      hasTwoStates: hasTwoStates(),
      os: Platform.OS,
    });
  return (
    <Recipe recipe={containerRecipe}>
      <SwitchRow
        testID="overlays-container-enabled"
        label="enabled"
        value={isEnabled()}
        onChange={value => setIsEnabled(value)}
        color={COLOR}
      />
      <SwitchRow
        testID="overlays-container-two-states"
        label="hasTwoStates"
        value={hasTwoStates()}
        onChange={value => setHasTwoStates(value)}
        color={COLOR}
      />
      <text testID="overlays-container-view" class="info-text">
        {`native view here: ${viewName()}`}
      </text>
      <ScreenContainer enabled={isEnabled()} hasTwoStates={hasTwoStates()} />
    </Recipe>
  );
}
