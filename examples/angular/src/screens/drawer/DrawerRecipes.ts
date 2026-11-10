import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectDrawerNavigation } from '@symbiote-native/navigation/angular';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { LINE_COLOR } from '../../navigation-lines';
import { recipeById } from '../../navigation-recipes';
import { injectDrawerPanel } from './drawer-panel';
import {
  DISTANCE_CHOICES,
  DRAWER_POSITIONS,
  DRAWER_TYPES,
  EDGE_CHOICES,
  OVERLAY_CHOICES,
  VELOCITY_CHOICES,
  WIDTH_CHOICES,
} from './drawer-settings';

// The drawer props are the panel, the Drawer above reads them on every render
@Component({
  selector: 'DrawerRecipes',
  standalone: true,
  imports: [ActionButton, LabeledChoice, Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="typeRecipe">
      <LabeledChoice
        testID="drawer-type"
        label="drawerType"
        [value]="settings().drawerType"
        [options]="drawerTypes"
        (valueChange)="update({ drawerType: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="positionRecipe">
      <LabeledChoice
        testID="drawer-position"
        label="drawerPosition"
        [value]="settings().drawerPosition"
        [options]="drawerPositions"
        (valueChange)="update({ drawerPosition: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="widthRecipe">
      <LabeledChoice
        testID="drawer-width"
        label="drawerWidth"
        [value]="settings().width"
        [options]="widthChoices"
        (valueChange)="update({ width: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="overlayRecipe">
      <LabeledChoice
        testID="drawer-overlay"
        label="overlayColor"
        [value]="settings().overlay"
        [options]="overlayChoices"
        (valueChange)="update({ overlay: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="swipeRecipe">
      <SwitchRow
        testID="drawer-swipe-enabled"
        label="swipeEnabled"
        [value]="settings().isSwipeEnabled"
        (valueChange)="update({ isSwipeEnabled: $event })"
        [color]="color"
      ></SwitchRow>
      <LabeledChoice
        testID="drawer-edge"
        label="swipeEdgeWidth"
        [value]="settings().edge"
        [options]="edgeChoices"
        (valueChange)="update({ edge: $event })"
        [color]="color"
      ></LabeledChoice>
      <LabeledChoice
        testID="drawer-distance"
        label="swipeMinDistance"
        [value]="settings().distance"
        [options]="distanceChoices"
        (valueChange)="update({ distance: $event })"
        [color]="color"
      ></LabeledChoice>
      <LabeledChoice
        testID="drawer-velocity"
        label="swipeMinVelocity"
        [value]="settings().velocity"
        [options]="velocityChoices"
        (valueChange)="update({ velocity: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="contentRecipe">
      <ActionButton
        testID="drawer-open"
        title="Open drawer"
        (press)="navigation.openDrawer()"
        [color]="color"
      ></ActionButton>
      <ActionButton
        testID="drawer-toggle"
        title="Toggle drawer"
        (press)="navigation.toggleDrawer()"
        [color]="color"
      ></ActionButton>
    </Recipe>
  `,
})
export class DrawerRecipes {
  private readonly panel = injectDrawerPanel();

  readonly navigation = injectDrawerNavigation();
  readonly settings = this.panel.settings;
  readonly update = this.panel.update;
  readonly color = LINE_COLOR.structure;
  readonly drawerTypes = DRAWER_TYPES;
  readonly drawerPositions = DRAWER_POSITIONS;
  readonly widthChoices = WIDTH_CHOICES;
  readonly overlayChoices = OVERLAY_CHOICES;
  readonly edgeChoices = EDGE_CHOICES;
  readonly distanceChoices = DISTANCE_CHOICES;
  readonly velocityChoices = VELOCITY_CHOICES;
  readonly typeRecipe = recipeById('drawer-type');
  readonly positionRecipe = recipeById('drawer-position');
  readonly widthRecipe = recipeById('drawer-width');
  readonly overlayRecipe = recipeById('drawer-overlay');
  readonly swipeRecipe = recipeById('drawer-swipe');
  readonly contentRecipe = recipeById('drawer-content');
}
