import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ChoiceRow } from '../../components/ChoiceRow';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import {
  DIRECTIONS,
  LEFT_KINDS,
  PRIORITIES,
  RIGHT_KINDS,
  TITLE_KINDS,
} from './header-views-settings';
import { injectHeaderViews } from './use-header-views';

// Recipes for the three header slots: what fills them, which way they run and how they sit
@Component({
  selector: 'ViewRecipes',
  standalone: true,
  imports: [ChoiceRow, Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="customRecipe">
      <ChoiceRow
        testID="header-views-title"
        [value]="settings().title"
        [options]="titleKinds"
        (valueChange)="update({ title: $event })"
        [color]="color"
      ></ChoiceRow>
      <ChoiceRow
        testID="header-views-left"
        [value]="settings().left"
        [options]="leftKinds"
        (valueChange)="update({ left: $event })"
        [color]="color"
      ></ChoiceRow>
      <ChoiceRow
        testID="header-views-right"
        [value]="settings().right"
        [options]="rightKinds"
        (valueChange)="update({ right: $event })"
        [color]="color"
      ></ChoiceRow>
      <text testID="header-views-last-tap" class="info-text">
        last tapped: {{ settings().lastTap }}
      </text>
    </Recipe>
    <Recipe [recipe]="directionRecipe">
      <ChoiceRow
        testID="header-views-direction"
        [value]="settings().direction"
        [options]="directions"
        (valueChange)="update({ direction: $event })"
        [color]="color"
      ></ChoiceRow>
    </Recipe>
    <Recipe [recipe]="glassRecipe">
      <SwitchRow
        testID="header-views-left-glass"
        label="headerLeftBackgroundVisible"
        [value]="settings().isLeftBackgroundVisible"
        (valueChange)="update({ isLeftBackgroundVisible: $event })"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="header-views-right-glass"
        label="headerRightBackgroundVisible"
        [value]="settings().isRightBackgroundVisible"
        (valueChange)="update({ isRightBackgroundVisible: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
    <Recipe [recipe]="priorityRecipe">
      <ChoiceRow
        testID="header-views-left-priority"
        [value]="settings().leftPriority"
        [options]="priorities"
        (valueChange)="update({ leftPriority: $event })"
        [color]="color"
      ></ChoiceRow>
      <ChoiceRow
        testID="header-views-right-priority"
        [value]="settings().rightPriority"
        [options]="priorities"
        (valueChange)="update({ rightPriority: $event })"
        [color]="color"
      ></ChoiceRow>
    </Recipe>
  `,
})
export class ViewRecipes {
  private readonly views = injectHeaderViews();

  readonly settings = this.views.settings;
  readonly update = this.views.update;
  readonly color = LINE_COLOR.presentation;
  readonly titleKinds = TITLE_KINDS;
  readonly leftKinds = LEFT_KINDS;
  readonly rightKinds = RIGHT_KINDS;
  readonly directions = DIRECTIONS;
  readonly priorities = PRIORITIES;
  readonly customRecipe = recipeById('header-views-custom');
  readonly directionRecipe = recipeById('header-views-direction');
  readonly glassRecipe = recipeById('header-views-glass');
  readonly priorityRecipe = recipeById('header-views-priority');
}
