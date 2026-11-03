import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ChoiceRow } from '../../components/ChoiceRow';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { BACK_DISPLAY_MODES, BACK_TITLES } from './header-views-settings';
import { injectHeaderViews } from './use-header-views';

// Recipes for the back button: its text, whether it shows and what its arrow looks like
@Component({
  selector: 'BackRecipes',
  standalone: true,
  imports: [ChoiceRow, Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="titleRecipe">
      <ChoiceRow
        testID="header-views-back-title"
        [value]="settings().backTitle"
        [options]="backTitles"
        (valueChange)="update({ backTitle: $event })"
        [color]="color"
      ></ChoiceRow>
      <ChoiceRow
        testID="header-views-back-mode"
        [value]="settings().backDisplayMode"
        [options]="backDisplayModes"
        (valueChange)="update({ backDisplayMode: $event })"
        [color]="color"
      ></ChoiceRow>
    </Recipe>
    <Recipe [recipe]="visibleRecipe">
      <SwitchRow
        testID="header-views-back-visible"
        label="headerBackVisible"
        [value]="settings().isBackVisible"
        (valueChange)="update({ isBackVisible: $event })"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="header-views-back-menu"
        label="headerBackButtonMenuEnabled"
        [value]="settings().isBackMenuEnabled"
        (valueChange)="update({ isBackMenuEnabled: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
    <Recipe [recipe]="imageRecipe">
      <SwitchRow
        testID="header-views-back-image"
        label="headerBackImageSource"
        [value]="settings().isBackImageCustom"
        (valueChange)="update({ isBackImageCustom: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
  `,
})
export class BackRecipes {
  private readonly views = injectHeaderViews();

  readonly settings = this.views.settings;
  readonly update = this.views.update;
  readonly color = LINE_COLOR.presentation;
  readonly backTitles = BACK_TITLES;
  readonly backDisplayModes = BACK_DISPLAY_MODES;
  readonly titleRecipe = recipeById('header-views-back-title');
  readonly visibleRecipe = recipeById('header-views-back-visible');
  readonly imageRecipe = recipeById('header-views-back-image');
}
