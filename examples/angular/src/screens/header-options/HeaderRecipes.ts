import { Component, computed } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectRoute } from '@symbiote-native/navigation/angular';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { isParamsRecord, readText } from '../read-params';
import { injectRouteSettings } from '../use-route-settings';
import {
  ITEM_KINDS,
  readHeaderOptionsSettings,
} from './header-options-settings';

const NO_ACTION = 'none yet, tap a bar button or menu item';

@Component({
  selector: 'HeaderRecipes',
  standalone: true,
  imports: [LabeledChoice, Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="largeTitleRecipe">
      <SwitchRow
        testID="header-large-title"
        label="headerLargeTitle"
        [value]="settings().isLargeTitle"
        (valueChange)="update({ isLargeTitle: $event })"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="header-translucent"
        label="headerTranslucent"
        [value]="settings().isTranslucent"
        (valueChange)="update({ isTranslucent: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
    <Recipe [recipe]="barItemsRecipe">
      <LabeledChoice
        testID="header-left-items"
        label="headerLeftBarButtonItems"
        [value]="settings().leftItems"
        [options]="itemKinds"
        (valueChange)="update({ leftItems: $event })"
        [color]="color"
      ></LabeledChoice>
      <LabeledChoice
        testID="header-right-items"
        label="headerRightBarButtonItems"
        [value]="settings().rightItems"
        [options]="itemKinds"
        (valueChange)="update({ rightItems: $event })"
        [color]="color"
      ></LabeledChoice>
      <SwitchRow
        testID="header-spaced"
        label="spacing item and a second button"
        [value]="settings().isSpaced"
        (valueChange)="update({ isSpaced: $event })"
        [color]="color"
      ></SwitchRow>
      <text testID="header-last-action" class="info-text">
        last header action: {{ lastAction() }}
      </text>
    </Recipe>
  `,
})
export class HeaderRecipes {
  private readonly route = injectRoute();
  private readonly routeSettings = injectRouteSettings(
    readHeaderOptionsSettings,
  );

  readonly settings = this.routeSettings.settings;
  readonly update = this.routeSettings.update;
  readonly color = LINE_COLOR.presentation;
  readonly itemKinds = ITEM_KINDS;
  readonly largeTitleRecipe = recipeById('header-options-large-title');
  readonly barItemsRecipe = recipeById('header-options-bar-items');
  // What the last bar button or menu entry reported, kept in the route params by the resolver
  readonly lastAction = computed(() => {
    const { params } = this.route();
    return (
      (isParamsRecord(params)
        ? readText(params, 'lastHeaderAction', '')
        : '') || NO_ACTION
    );
  });
}
