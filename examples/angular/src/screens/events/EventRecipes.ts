import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectStackNavigation } from '@symbiote-native/navigation/angular';
import { ActionButton } from '../../components/ActionButton';
import { Recipe } from '../../components/Recipe';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';

// One recipe per event, the buttons cause the event and the live log above shows it
@Component({
  selector: 'EventRecipes',
  standalone: true,
  imports: [ActionButton, Recipe, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="focusRecipe">
      <ActionButton
        testID="events-push-focus"
        title="Push Details"
        (press)="pushDetails()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="stateRecipe">
      <ActionButton
        testID="events-set-params"
        title="setParams"
        (press)="setParams()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="transitionRecipe">
      <ActionButton
        testID="events-push-transition"
        title="Push Details"
        (press)="pushDetails()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="headerRecipe">
      <ActionButton
        testID="events-push-header"
        title="Push Details"
        (press)="pushDetails()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="removeRecipe">
      <text class="info-text">
        Go back with the header button, return here and read the log.
      </text>
    </Recipe>
  `,
})
export class EventRecipes {
  private readonly navigation = injectStackNavigation();

  readonly color = LINE_COLOR.introspection;
  readonly focusRecipe = recipeById('events-focus-blur');
  readonly stateRecipe = recipeById('events-state');
  readonly transitionRecipe = recipeById('events-transition');
  readonly headerRecipe = recipeById('events-header');
  readonly removeRecipe = recipeById('events-before-remove');

  pushDetails(): void {
    this.navigation.push(ROUTE_NAME.Details);
  }

  setParams(): void {
    this.navigation.setParams({ pressedAt: Date.now() });
  }
}
