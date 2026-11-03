import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ChoiceRow } from '../../components/ChoiceRow';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import {
  CONTROLLER_MODE_OPTIONS,
  DIRECTION_OPTIONS,
  injectNativeTabsDemo,
  MINIMIZE_OPTIONS,
  SCHEME_OPTIONS,
  SIDEBAR_PLACEMENT_OPTIONS,
} from './native-tabs-demo';

// Recipes for the options of the whole bar, the host of the native tabs
@Component({
  selector: 'BarRecipes',
  standalone: true,
  imports: [ChoiceRow, Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="hiddenRecipe">
      <SwitchRow
        testID="native-tabs-hidden"
        label="tabBarHidden"
        [value]="settings().isBarHidden"
        (valueChange)="update({ isBarHidden: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
    <Recipe [recipe]="minimizeRecipe">
      <ChoiceRow
        testID="native-tabs-minimize"
        [value]="settings().minimize"
        [options]="minimizeOptions"
        (valueChange)="update({ minimize: $event })"
        [color]="color"
      ></ChoiceRow>
    </Recipe>
    <Recipe [recipe]="accessoryRecipe">
      <SwitchRow
        testID="native-tabs-accessory"
        label="bottomAccessory visible"
        [value]="settings().isAccessoryShown"
        (valueChange)="update({ isAccessoryShown: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
    <Recipe [recipe]="modeRecipe">
      <ChoiceRow
        testID="native-tabs-mode"
        [value]="settings().controllerMode"
        [options]="controllerModeOptions"
        (valueChange)="update({ controllerMode: $event })"
        [color]="color"
      ></ChoiceRow>
      <ChoiceRow
        testID="native-tabs-placement"
        [value]="settings().sidebarPlacement"
        [options]="sidebarPlacementOptions"
        (valueChange)="update({ sidebarPlacement: $event })"
        [color]="color"
      ></ChoiceRow>
    </Recipe>
    <Recipe [recipe]="schemeRecipe">
      <ChoiceRow
        testID="native-tabs-scheme"
        [value]="settings().scheme"
        [options]="schemeOptions"
        (valueChange)="update({ scheme: $event })"
        [color]="color"
      ></ChoiceRow>
      <ChoiceRow
        testID="native-tabs-direction"
        [value]="settings().direction"
        [options]="directionOptions"
        (valueChange)="update({ direction: $event })"
        [color]="color"
      ></ChoiceRow>
      <SwitchRow
        testID="native-tabs-tint"
        label="tabBarTintColor"
        [value]="settings().isTinted"
        (valueChange)="update({ isTinted: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
  `,
})
export class BarRecipes {
  private readonly demo = injectNativeTabsDemo();

  readonly settings = this.demo.settings;
  readonly update = this.demo.update;
  readonly color = LINE_COLOR.structure;
  readonly minimizeOptions = MINIMIZE_OPTIONS;
  readonly controllerModeOptions = CONTROLLER_MODE_OPTIONS;
  readonly sidebarPlacementOptions = SIDEBAR_PLACEMENT_OPTIONS;
  readonly schemeOptions = SCHEME_OPTIONS;
  readonly directionOptions = DIRECTION_OPTIONS;
  readonly hiddenRecipe = recipeById('native-tabs-hidden');
  readonly minimizeRecipe = recipeById('native-tabs-minimize');
  readonly accessoryRecipe = recipeById('native-tabs-accessory');
  readonly modeRecipe = recipeById('native-tabs-controller-mode');
  readonly schemeRecipe = recipeById('native-tabs-scheme');
}
