import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { injectRouteSettings } from '../use-route-settings';
import {
  readInsetsSettings,
  SCREEN_ORIENTATIONS,
  STATUS_BAR_ANIMATIONS,
  STATUS_BAR_STYLES,
} from './insets-settings';
import { IS_STATUS_BAR_SETTABLE } from './status-bar-support';

// The bars around the screen: status bar, orientation, home indicator, Android navigation bar
@Component({
  selector: 'SystemBarRecipes',
  standalone: true,
  imports: [LabeledChoice, Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="styleRecipe">
      @if (isSettable) {
        <LabeledChoice
          testID="insets-status-style"
          label="statusBarStyle"
          [value]="settings().statusBarStyle"
          [options]="statusBarStyles"
          (valueChange)="update({ statusBarStyle: $event })"
          [color]="color"
        ></LabeledChoice>
      } @else {
        <text class="info-text">{{ notSettable }}</text>
      }
    </Recipe>
    <Recipe [recipe]="hiddenRecipe">
      @if (isSettable) {
        <SwitchRow
          testID="insets-status-hidden"
          label="statusBarHidden"
          [value]="settings().isStatusBarHidden"
          (valueChange)="update({ isStatusBarHidden: $event })"
          [color]="color"
        ></SwitchRow>
        <LabeledChoice
          testID="insets-status-animation"
          label="statusBarAnimation"
          [value]="settings().statusBarAnimation"
          [options]="statusBarAnimations"
          (valueChange)="update({ statusBarAnimation: $event })"
          [color]="color"
        ></LabeledChoice>
      } @else {
        <text class="info-text">{{ notSettable }}</text>
      }
    </Recipe>
    <Recipe [recipe]="orientationRecipe">
      <LabeledChoice
        testID="insets-orientation"
        label="screenOrientation"
        [value]="settings().screenOrientation"
        [options]="screenOrientations"
        (valueChange)="update({ screenOrientation: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="indicatorRecipe">
      <SwitchRow
        testID="insets-home-indicator"
        label="homeIndicatorHidden"
        [value]="settings().isHomeIndicatorHidden"
        (valueChange)="update({ isHomeIndicatorHidden: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
    <Recipe [recipe]="navigationBarRecipe">
      <SwitchRow
        testID="insets-navigation-bar"
        label="navigationBarHidden"
        [value]="settings().isNavigationBarHidden"
        (valueChange)="update({ isNavigationBarHidden: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
  `,
})
export class SystemBarRecipes {
  private readonly route = injectRouteSettings(readInsetsSettings);

  readonly settings = this.route.settings;
  readonly update = this.route.update;
  readonly color = LINE_COLOR.presentation;
  readonly isSettable = IS_STATUS_BAR_SETTABLE;
  readonly statusBarStyles = STATUS_BAR_STYLES;
  readonly statusBarAnimations = STATUS_BAR_ANIMATIONS;
  readonly screenOrientations = SCREEN_ORIENTATIONS;
  readonly notSettable =
    'This app keeps UIViewControllerBasedStatusBarAppearance off for the React Native StatusBar demo, so on iOS this option would raise a red box. Turn the key on in Info.plist to try it.';
  readonly styleRecipe = recipeById('insets-status-style');
  readonly hiddenRecipe = recipeById('insets-status-hidden');
  readonly orientationRecipe = recipeById('insets-orientation');
  readonly indicatorRecipe = recipeById('insets-home-indicator');
  readonly navigationBarRecipe = recipeById('insets-navigation-bar');
}
