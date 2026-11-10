import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { POP_COUNTS } from './probe';
import { injectProbe } from './use-probe';

// The stack methods of the handle, the readout above shows what each call did to the depth
@Component({
  selector: 'MethodRecipes',
  standalone: true,
  imports: [ActionButton, LabeledChoice, Recipe, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="pushRecipe">
      <ActionButton
        testID="stack-push"
        title="push(probe)"
        (press)="actions.pushProbe()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="popRecipe">
      <LabeledChoice
        testID="stack-pop-count"
        label="pop(count)"
        [value]="panel().popCount"
        [options]="popCounts"
        (valueChange)="update({ popCount: $event })"
        [color]="color"
      ></LabeledChoice>
      <ActionButton
        testID="stack-pop"
        title="pop(count)"
        (press)="actions.pop()"
        [color]="color"
      ></ActionButton>
      <ActionButton
        testID="stack-pop-to-top"
        title="popToTop()"
        (press)="actions.popToTop()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="popToRecipe">
      <ActionButton
        testID="stack-pop-to"
        title="popTo(first probe's parent)"
        (press)="actions.popToAnchor()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="resetRecipe">
      <ActionButton
        testID="stack-reset"
        title="reset(menu + one probe)"
        (press)="actions.reset()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="canGoBackRecipe">
      <text testID="stack-can-go-back" class="list-row-text">
        canGoBack() is {{ probeState.canGoBack() }}
      </text>
    </Recipe>
  `,
})
export class MethodRecipes {
  readonly probeState = injectProbe();
  readonly panel = this.probeState.panel;
  readonly update = this.probeState.update;
  readonly actions = this.probeState.actions;
  readonly color = LINE_COLOR.routing;
  readonly popCounts = POP_COUNTS;
  readonly pushRecipe = recipeById('stack-push');
  readonly popRecipe = recipeById('stack-pop');
  readonly popToRecipe = recipeById('stack-pop-to');
  readonly resetRecipe = recipeById('stack-reset');
  readonly canGoBackRecipe = recipeById('stack-can-go-back');
}
