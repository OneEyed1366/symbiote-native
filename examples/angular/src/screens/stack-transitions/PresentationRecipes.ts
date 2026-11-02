import { Component, computed } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import {
  ANIMATIONS,
  DURATIONS,
  PRESENTATIONS,
  REPLACE_ANIMATIONS,
  timedPanelOf,
} from './probe';
import { injectProbe } from './use-probe';

const COLOR = LINE_COLOR.routing;

// iOS times only some pairs, so the push of this recipe picks one of them
@Component({
  selector: 'DurationRecipe',
  standalone: true,
  imports: [ActionButton, LabeledChoice, Recipe, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="durationRecipe">
      <LabeledChoice
        testID="stack-duration"
        label="transitionDuration (ms)"
        [value]="panel().nextDuration"
        [options]="durations"
        (valueChange)="update({ nextDuration: $event })"
        [color]="color"
      ></LabeledChoice>
      <text class="info-text">{{ pairText() }}</text>
      <ActionButton
        testID="stack-push-duration"
        title="Push a timed probe"
        (press)="actions.pushTimedProbe()"
        [color]="color"
      ></ActionButton>
    </Recipe>
  `,
})
export class DurationRecipe {
  private readonly probeState = injectProbe();

  readonly panel = this.probeState.panel;
  readonly update = this.probeState.update;
  readonly actions = this.probeState.actions;
  readonly color = COLOR;
  readonly durations = DURATIONS;
  readonly durationRecipe = recipeById('stack-duration');
  readonly pairText = computed(() => {
    const timed = timedPanelOf(this.panel());
    return `Pushes as ${timed.nextPresentation} with ${timed.nextAnimation}, the pair iOS can time`;
  });
}

// Each choice is for the next probe, the probe keeps it as its own entry transition
@Component({
  selector: 'PresentationRecipes',
  standalone: true,
  imports: [
    ActionButton,
    DurationRecipe,
    LabeledChoice,
    Recipe,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <Recipe [recipe]="presentationRecipe">
      <LabeledChoice
        testID="stack-presentation"
        label="stackPresentation"
        [value]="panel().nextPresentation"
        [options]="presentations"
        (valueChange)="update({ nextPresentation: $event })"
        [color]="color"
      ></LabeledChoice>
      <ActionButton
        testID="stack-push-presentation"
        title="Push a probe"
        (press)="actions.pushProbe()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="animationRecipe">
      <LabeledChoice
        testID="stack-animation"
        label="stackAnimation"
        [value]="panel().nextAnimation"
        [options]="animations"
        (valueChange)="update({ nextAnimation: $event })"
        [color]="color"
      ></LabeledChoice>
      <ActionButton
        testID="stack-push-animation"
        title="Push a probe"
        (press)="actions.pushProbe()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <DurationRecipe></DurationRecipe>
    <Recipe [recipe]="replaceRecipe">
      <LabeledChoice
        testID="stack-replace-animation"
        label="replaceAnimation"
        [value]="panel().nextReplaceAnimation"
        [options]="replaceAnimations"
        (valueChange)="update({ nextReplaceAnimation: $event })"
        [color]="color"
      ></LabeledChoice>
      @if (probe().isProbe) {
        <ActionButton
          testID="stack-replace"
          title="Replace this probe"
          (press)="actions.replaceWithProbe()"
          [color]="color"
        ></ActionButton>
      } @else {
        <text class="info-text">
          Push a probe first, replace swaps the top one
        </text>
      }
    </Recipe>
  `,
})
export class PresentationRecipes {
  private readonly probeState = injectProbe();

  readonly panel = this.probeState.panel;
  readonly update = this.probeState.update;
  readonly probe = this.probeState.probe;
  readonly actions = this.probeState.actions;
  readonly color = COLOR;
  readonly presentations = PRESENTATIONS;
  readonly animations = ANIMATIONS;
  readonly replaceAnimations = REPLACE_ANIMATIONS;
  readonly presentationRecipe = recipeById('stack-presentation');
  readonly animationRecipe = recipeById('stack-animation');
  readonly replaceRecipe = recipeById('stack-replace-animation');
}
