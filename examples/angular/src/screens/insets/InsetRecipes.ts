import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { injectRouteSettings } from '../use-route-settings';
import {
  DISABLED_INSETS,
  EDGE_MODES,
  HEADER_STYLES,
  readInsetsSettings,
  SCROLL_EDGE_EFFECTS,
} from './insets-settings';

// Where content may sit under the system chrome, and the header look that goes with it
@Component({
  selector: 'InsetRecipes',
  standalone: true,
  imports: [LabeledChoice, Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="edgesRecipe">
      <LabeledChoice
        testID="insets-edge-top"
        label="safeAreaEdges.top"
        [value]="settings().topEdge"
        [options]="edgeModes"
        (valueChange)="update({ topEdge: $event })"
        [color]="color"
      ></LabeledChoice>
      <LabeledChoice
        testID="insets-edge-right"
        label="safeAreaEdges.right"
        [value]="settings().rightEdge"
        [options]="edgeModes"
        (valueChange)="update({ rightEdge: $event })"
        [color]="color"
      ></LabeledChoice>
      <LabeledChoice
        testID="insets-edge-bottom"
        label="safeAreaEdges.bottom"
        [value]="settings().bottomEdge"
        [options]="edgeModes"
        (valueChange)="update({ bottomEdge: $event })"
        [color]="color"
      ></LabeledChoice>
      <LabeledChoice
        testID="insets-edge-left"
        label="safeAreaEdges.left"
        [value]="settings().leftEdge"
        [options]="edgeModes"
        (valueChange)="update({ leftEdge: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="scrollEdgeRecipe">
      <LabeledChoice
        testID="insets-effect-top"
        label="scrollEdgeEffects.top"
        [value]="settings().topEffect"
        [options]="scrollEdgeEffects"
        (valueChange)="update({ topEffect: $event })"
        [color]="color"
      ></LabeledChoice>
      <LabeledChoice
        testID="insets-effect-bottom"
        label="scrollEdgeEffects.bottom"
        [value]="settings().bottomEffect"
        [options]="scrollEdgeEffects"
        (valueChange)="update({ bottomEffect: $event })"
        [color]="color"
      ></LabeledChoice>
      <LabeledChoice
        testID="insets-effect-side"
        label="scrollEdgeEffects.left and right"
        [value]="settings().sideEffect"
        [options]="scrollEdgeEffects"
        (valueChange)="update({ sideEffect: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="disableRecipe">
      <LabeledChoice
        testID="insets-disable"
        label="disable...InsetApplication"
        [value]="settings().disabledInset"
        [options]="disabledInsets"
        (valueChange)="update({ disabledInset: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="headerStyleRecipe">
      <LabeledChoice
        testID="insets-header-style"
        label="headerUserInterfaceStyle"
        [value]="settings().headerStyle"
        [options]="headerStyles"
        (valueChange)="update({ headerStyle: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="removedRecipe">
      <SwitchRow
        testID="insets-removed-colors"
        label="Set the colours and the top inset flag"
        [value]="settings().isLegacyColorSet"
        (valueChange)="update({ isLegacyColorSet: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
  `,
})
export class InsetRecipes {
  private readonly route = injectRouteSettings(readInsetsSettings);

  readonly settings = this.route.settings;
  readonly update = this.route.update;
  readonly color = LINE_COLOR.presentation;
  readonly edgeModes = EDGE_MODES;
  readonly scrollEdgeEffects = SCROLL_EDGE_EFFECTS;
  readonly disabledInsets = DISABLED_INSETS;
  readonly headerStyles = HEADER_STYLES;
  readonly edgesRecipe = recipeById('insets-safe-area-edges');
  readonly scrollEdgeRecipe = recipeById('insets-scroll-edge');
  readonly disableRecipe = recipeById('insets-disable-inset');
  readonly headerStyleRecipe = recipeById('insets-header-style');
  readonly removedRecipe = recipeById('insets-removed-colors');
}
