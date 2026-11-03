import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ChoiceRow } from '../../components/ChoiceRow';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { BLUR_EFFECTS } from './header-views-settings';
import { injectHeaderViews } from './use-header-views';

// Recipes for the look of the bar: translucency, large title, shadow lines and title fonts
@Component({
  selector: 'LookRecipes',
  standalone: true,
  imports: [ChoiceRow, Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="translucentRecipe">
      <SwitchRow
        testID="header-views-translucent"
        label="headerTranslucent"
        [value]="settings().isTranslucent"
        (valueChange)="update({ isTranslucent: $event })"
        [color]="color"
      ></SwitchRow>
      <ChoiceRow
        testID="header-views-blur"
        [value]="settings().blur"
        [options]="blurEffects"
        (valueChange)="update({ blur: $event })"
        [color]="color"
      ></ChoiceRow>
    </Recipe>
    <Recipe [recipe]="largeRecipe">
      <SwitchRow
        testID="header-views-large-title"
        label="headerLargeTitle"
        [value]="settings().isLargeTitle"
        (valueChange)="update({ isLargeTitle: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
    <Recipe [recipe]="shadowRecipe">
      <SwitchRow
        testID="header-views-shadow"
        label="headerShadowVisible"
        [value]="settings().isShadowVisible"
        (valueChange)="update({ isShadowVisible: $event })"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="header-views-large-shadow"
        label="headerLargeTitleShadowVisible"
        [value]="settings().isLargeShadowVisible"
        (valueChange)="update({ isLargeShadowVisible: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
    <Recipe [recipe]="styleRecipe">
      <SwitchRow
        testID="header-views-title-style"
        label="title, back title and large title styles"
        [value]="settings().isTitleStyled"
        (valueChange)="update({ isTitleStyled: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
  `,
})
export class LookRecipes {
  private readonly views = injectHeaderViews();

  readonly settings = this.views.settings;
  readonly update = this.views.update;
  readonly color = LINE_COLOR.presentation;
  readonly blurEffects = BLUR_EFFECTS;
  readonly translucentRecipe = recipeById('header-views-translucent');
  readonly largeRecipe = recipeById('header-views-large-title');
  readonly shadowRecipe = recipeById('header-views-shadow');
  readonly styleRecipe = recipeById('header-views-title-style');
}
