import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ChoiceRow } from '../../components/ChoiceRow';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { SWIPE_AREAS, SWIPE_DIRECTIONS } from './gestures-settings';
import { injectGestures } from './use-gestures';

// Recipes for the swipe itself: whether it works, where it starts and which way it goes
@Component({
  selector: 'SwipeRecipes',
  standalone: true,
  imports: [ChoiceRow, Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="enabledRecipe">
      <SwitchRow
        testID="gestures-enabled"
        label="gestureEnabled"
        [value]="settings().isGestureEnabled"
        (valueChange)="update({ isGestureEnabled: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
    <Recipe [recipe]="fullScreenRecipe">
      <SwitchRow
        testID="gestures-full-screen"
        label="fullScreenSwipeEnabled"
        [value]="settings().isFullScreenSwipe"
        (valueChange)="update({ isFullScreenSwipe: $event })"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="gestures-full-screen-shadow"
        label="fullScreenSwipeShadowEnabled"
        [value]="settings().isFullScreenShadow"
        (valueChange)="update({ isFullScreenShadow: $event })"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="gestures-custom-animation"
        label="customAnimationOnSwipe"
        [value]="settings().isCustomAnimation"
        (valueChange)="update({ isCustomAnimation: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
    <Recipe [recipe]="areaRecipe">
      <ChoiceRow
        testID="gestures-area"
        [value]="settings().area"
        [options]="areas"
        (valueChange)="update({ area: $event })"
        [color]="color"
      ></ChoiceRow>
    </Recipe>
    <Recipe [recipe]="directionRecipe">
      <ChoiceRow
        testID="gestures-direction"
        [value]="settings().swipeDirection"
        [options]="directions"
        (valueChange)="update({ swipeDirection: $event })"
        [color]="color"
      ></ChoiceRow>
    </Recipe>
    <Recipe [recipe]="keyboardRecipe">
      <text-input
        testID="gestures-keyboard-input"
        placeholder="Focus me, then swipe back"
        placeholderTextColor="#41506a"
        class="text-input"
      ></text-input>
      <SwitchRow
        testID="gestures-keyboard"
        label="hideKeyboardOnSwipe"
        [value]="settings().isKeyboardHidden"
        (valueChange)="update({ isKeyboardHidden: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
  `,
})
export class SwipeRecipes {
  private readonly gestures = injectGestures();

  readonly settings = this.gestures.settings;
  readonly update = this.gestures.update;
  readonly color = LINE_COLOR.presentation;
  readonly areas = SWIPE_AREAS;
  readonly directions = SWIPE_DIRECTIONS;
  readonly enabledRecipe = recipeById('gestures-enabled');
  readonly fullScreenRecipe = recipeById('gestures-full-screen');
  readonly areaRecipe = recipeById('gestures-area');
  readonly directionRecipe = recipeById('gestures-direction');
  readonly keyboardRecipe = recipeById('gestures-keyboard');
}
