import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../../components/ActionButton';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';
import { injectGestures } from './use-gestures';

// Recipes for leaving the screen: stopping it, noticing a cancelled swipe, the Android back press
@Component({
  selector: 'DismissRecipes',
  standalone: true,
  imports: [ActionButton, Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="preventRecipe">
      <SwitchRow
        testID="gestures-prevent"
        label="preventNativeDismiss"
        [value]="settings().isDismissPrevented"
        (valueChange)="update({ isDismissPrevented: $event })"
        [color]="color"
      ></SwitchRow>
      <text testID="gestures-attempts" class="info-text">
        dismissals stopped: {{ settings().dismissAttempts }}
      </text>
      <ActionButton
        testID="gestures-leave"
        title="Leave anyway"
        (press)="navigation.pop()"
        [color]="color"
      ></ActionButton>
      <ActionButton
        testID="gestures-open-modal"
        title="Open this screen as a modal"
        (press)="openModal()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="cancelRecipe">
      <text testID="gestures-cancels" class="info-text">
        swipes let go: {{ settings().gestureCancels }}
      </text>
    </Recipe>
    <Recipe [recipe]="androidBackRecipe">
      <SwitchRow
        testID="gestures-android-back"
        label="nativeBackButtonDismissalEnabled"
        [value]="settings().isNativeBackDismissal"
        (valueChange)="update({ isNativeBackDismissal: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
  `,
})
export class DismissRecipes {
  private readonly gestures = injectGestures();

  readonly settings = this.gestures.settings;
  readonly update = this.gestures.update;
  readonly navigation = this.gestures.navigation;
  readonly color = LINE_COLOR.presentation;
  readonly preventRecipe = recipeById('gestures-prevent');
  readonly cancelRecipe = recipeById('gestures-cancel');
  readonly androidBackRecipe = recipeById('gestures-android-back');

  openModal(): void {
    this.navigation.push(ROUTE_NAME.Gestures, { isModal: true });
  }
}
