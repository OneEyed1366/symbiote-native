import { Component, computed, input } from '@angular/core';
import { AnimatedView, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  injectStackNavigation,
  injectTransitionProgress,
} from '@symbiote-native/navigation/angular';
import { ActionButton } from '../../components/ActionButton';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';
import { injectRouteSettings } from '../use-route-settings';
import type { ITransitionSnapshot } from './transition-readout';
import { readTransitionSettings } from './transition-settings';
import { injectTransitionReadoutLines } from './use-transition-readout';

const COLOR = LINE_COLOR.introspection;
const FADE_FROM = 0.2;
const SCALE_FROM = 0.85;

type IFlagValue = ReturnType<typeof injectTransitionProgress>['closing'];

@Component({
  selector: 'Lamp',
  standalone: true,
  imports: [AnimatedView, SYMBIOTE_ELEMENTS],
  template: `
    <view [testID]="testID()" class="lamp">
      <AnimatedView class="lamp-lit" [style]="litStyle()"></AnimatedView>
      <text class="lamp-text">{{ label() }}</text>
    </view>
  `,
})
export class Lamp {
  readonly testID = input.required<string>();
  readonly label = input.required<string>();
  readonly value = input.required<IFlagValue>();

  readonly litStyle = computed(() => ({ opacity: this.value() }));
}

// Everything here is a native driven value, so a swipe back redraws it without any JS work
@Component({
  selector: 'ProgressRecipes',
  standalone: true,
  imports: [AnimatedView, Lamp, Recipe, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="progressRecipe">
      <AnimatedView
        testID="transition-card"
        class="transition-card"
        [style]="cardStyle"
      >
        <text class="transition-card-text">I follow the progress value</text>
      </AnimatedView>
    </Recipe>
    <Recipe [recipe]="flagsRecipe">
      <view class="lamp-row">
        <Lamp
          testID="transition-closing"
          label="closing"
          [value]="transition.closing"
        ></Lamp>
        <Lamp
          testID="transition-going-forward"
          label="goingForward"
          [value]="transition.goingForward"
        ></Lamp>
      </view>
    </Recipe>
  `,
})
export class ProgressRecipes {
  readonly transition = injectTransitionProgress();
  readonly progressRecipe = recipeById('transition-progress-hook');
  readonly flagsRecipe = recipeById('transition-flags');

  readonly cardStyle = {
    opacity: this.transition.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [FADE_FROM, 1],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        scale: this.transition.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [SCALE_FROM, 1],
          extrapolate: 'clamp',
        }),
      },
    ],
  };
}

function readoutText({ transitions, direction, ticks }: ITransitionSnapshot) {
  if (transitions === 0) return 'No transition has finished yet';
  return `${transitions} finished, the last one ${direction} in ${ticks} ticks`;
}

@Component({
  selector: 'ReadoutRecipe',
  standalone: true,
  imports: [ActionButton, Recipe, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="readoutRecipe">
      <text testID="transition-readout" class="list-row-text">{{
        text()
      }}</text>
      <ActionButton
        testID="transition-push"
        title="Push Details"
        (press)="pushDetails()"
        [color]="color"
      ></ActionButton>
    </Recipe>
  `,
})
export class ReadoutRecipe {
  private readonly navigation = injectStackNavigation();
  private readonly readout = injectTransitionReadoutLines();

  readonly color = COLOR;
  readonly readoutRecipe = recipeById('transition-readout');
  readonly text = computed(() => readoutText(this.readout()));

  pushDetails(): void {
    this.navigation.push(ROUTE_NAME.Details);
  }
}

@Component({
  selector: 'HeaderHeightRecipe',
  standalone: true,
  imports: [Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="heightRecipe">
      <SwitchRow
        testID="transition-translucent"
        label="Translucent header"
        [value]="settings().isTranslucent"
        (valueChange)="update({ isTranslucent: $event })"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="transition-large-title"
        label="Large title"
        [value]="settings().isLargeTitle"
        (valueChange)="update({ isLargeTitle: $event })"
        [color]="color"
      ></SwitchRow>
      <view testID="transition-ruler" class="ruler" [style]="rulerStyle()">
        <text class="list-row-text">{{ rulerText() }}</text>
      </view>
    </Recipe>
  `,
})
export class HeaderHeightRecipe {
  private readonly route = injectRouteSettings(readTransitionSettings);
  private readonly readout = injectTransitionReadoutLines();

  readonly settings = this.route.settings;
  readonly update = this.route.update;
  readonly color = COLOR;
  readonly heightRecipe = recipeById('transition-header-height');
  readonly rulerStyle = computed(() => ({
    height: this.readout().headerHeight ?? undefined,
  }));
  readonly rulerText = computed(() => {
    const { headerHeight } = this.readout();
    return headerHeight === null
      ? 'Header height not reported yet'
      : `Header height ${headerHeight}`;
  });
}
