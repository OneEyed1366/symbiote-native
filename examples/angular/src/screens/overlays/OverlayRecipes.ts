import { Component, computed, input, output, signal } from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  injectRoute,
  injectStackNavigation,
  ScreenContainer,
} from '@symbiote-native/navigation/angular';
import { resolveScreenContainerViewName } from '@symbiote-native/navigation';
import { ActionButton } from '../../components/ActionButton';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';
import { readIsModal } from '../read-params';
import { toastStore } from './use-toast';

const COLOR = LINE_COLOR.structure;

// Recipes for the toast: the screen below draws it, the modal on top only asks for it
@Component({
  selector: 'ToastRecipes',
  standalone: true,
  imports: [ActionButton, Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="toastRecipe">
      @if (isModal()) {
        <text class="info-text">
          This is the modal. Ask for each toast and see which one rises above
          it.
        </text>
        <ActionButton
          testID="overlays-toast-tree"
          title="Toast in the screen below (amber)"
          (press)="show('tree')"
          [color]="color"
        ></ActionButton>
        <ActionButton
          testID="overlays-toast-overlay"
          title="Toast in a FullWindowOverlay (mint)"
          (press)="show('overlay')"
          [color]="color"
        ></ActionButton>
      } @else {
        <text class="info-text">
          This is the screen below the modal, the toast buttons wait in the
          modal.
        </text>
        <ActionButton
          testID="overlays-open-modal"
          title="Open the modal"
          (press)="openModal()"
          [color]="color"
        ></ActionButton>
      }
    </Recipe>
    <Recipe [recipe]="voiceOverRecipe">
      <SwitchRow
        testID="overlays-voiceover"
        label="Overlay is modal for VoiceOver"
        [value]="isOverlayModal()"
        (valueChange)="overlayModalChange.emit($event)"
        [color]="color"
      ></SwitchRow>
    </Recipe>
  `,
})
export class ToastRecipes {
  private readonly route = injectRoute();
  private readonly navigation = injectStackNavigation();

  readonly isOverlayModal = input.required<boolean>();
  readonly overlayModalChange = output<boolean>();

  readonly color = COLOR;
  readonly toastRecipe = recipeById('overlays-toast');
  readonly voiceOverRecipe = recipeById('overlays-voiceover');
  readonly isModal = computed(() => readIsModal(this.route().params));

  // The amber toast is drawn by the screen below and the mint one by the overlay
  show(kind: 'tree' | 'overlay'): void {
    toastStore.show(kind);
  }

  openModal(): void {
    this.navigation.push(ROUTE_NAME.OverlayContainers, { isModal: true });
  }
}

// A bare container with the two switches it takes, and the native view they pick
@Component({
  selector: 'ContainerRecipe',
  standalone: true,
  imports: [Recipe, ScreenContainer, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="containerRecipe">
      <SwitchRow
        testID="overlays-container-enabled"
        label="enabled"
        [value]="isEnabled()"
        (valueChange)="isEnabled.set($event)"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="overlays-container-two-states"
        label="hasTwoStates"
        [value]="hasTwoStates()"
        (valueChange)="hasTwoStates.set($event)"
        [color]="color"
      ></SwitchRow>
      <text testID="overlays-container-view" class="info-text">
        native view here: {{ viewName() }}
      </text>
      <ScreenContainer
        [enabled]="isEnabled()"
        [hasTwoStates]="hasTwoStates()"
      ></ScreenContainer>
    </Recipe>
  `,
})
export class ContainerRecipe {
  readonly color = COLOR;
  readonly containerRecipe = recipeById('overlays-container');
  readonly isEnabled = signal(true);
  readonly hasTwoStates = signal(false);
  readonly viewName = computed(() =>
    resolveScreenContainerViewName({
      enabled: this.isEnabled(),
      hasTwoStates: this.hasTwoStates(),
      os: Platform.OS,
    }),
  );
}
