import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  injectFocusEffect,
  injectIsFocused,
  injectNavigationState,
  injectStackNavigation,
} from '@symbiote-native/navigation/angular';
import { ActionButton } from '../components/ActionButton';
import { Recipe } from '../components/Recipe';
import { ScreenHero } from '../components/ScreenHero';
import { recipeById } from '../navigation-recipes';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';

const COLOR = LINE_COLOR.introspection;

@Component({
  selector: 'FocusEffectRecipe',
  standalone: true,
  imports: [ActionButton, Recipe, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="effectOnce">
      <text testID="hooks-mounted-at" class="info-text">
        mounted once, at {{ mountedAt }}
      </text>
      <text testID="hooks-focus-count" class="info-text">
        injectFocusEffect ran: {{ focusCount() }}
      </text>
      <text class="info-text">{{ blurText() }}</text>
      <ActionButton
        testID="hooks-push-details"
        title="Push Details"
        (press)="navigation.push(details)"
        [color]="color"
      ></ActionButton>
    </Recipe>
  `,
})
export class FocusEffectRecipe {
  readonly navigation = injectStackNavigation();
  readonly color = COLOR;
  readonly details = ROUTE_NAME.Details;
  readonly effectOnce = recipeById('hooks-effect-once');
  readonly mountedAt = new Date().toLocaleTimeString();
  readonly focusCount = signal(0);
  readonly lastBlurAt = signal<number | undefined>(undefined);

  constructor() {
    injectFocusEffect(() => {
      this.focusCount.update(count => count + 1);
      return () => this.lastBlurAt.set(Date.now());
    });
  }

  blurText(): string {
    const blurredAt = this.lastBlurAt();
    return blurredAt === undefined
      ? 'not blurred yet'
      : `last blurred at ${blurredAt}`;
  }
}

@Component({
  selector: 'IsFocusedRecipe',
  standalone: true,
  imports: [Recipe, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="isFocusedRecipe">
      <text testID="hooks-is-focused" class="info-text">
        injectIsFocused(): {{ isFocused() }}
      </text>
    </Recipe>
  `,
})
export class IsFocusedRecipe {
  readonly isFocused = injectIsFocused();
  readonly isFocusedRecipe = recipeById('hooks-is-focused');
}

@Component({
  selector: 'NavigationStateRecipe',
  standalone: true,
  imports: [ActionButton, Recipe, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="stateRecipe">
      @for (name of routeNames(); track $index) {
        <text class="list-row-text">{{ $index }}. {{ name }}</text>
      }
      <ActionButton
        testID="hooks-push-self"
        title="Push this screen again"
        (press)="navigation.push(hooksDemo)"
        [color]="color"
      ></ActionButton>
    </Recipe>
  `,
})
export class NavigationStateRecipe {
  readonly navigation = injectStackNavigation();
  readonly color = COLOR;
  readonly hooksDemo = ROUTE_NAME.HooksDemo;
  readonly stateRecipe = recipeById('hooks-navigation-state');
  readonly routeNames = injectNavigationState(state =>
    state.routes.map(route => route.name),
  );
}

@Component({
  selector: 'RouteParamsRecipe',
  standalone: true,
  imports: [ActionButton, Recipe],
  template: `
    <Recipe [recipe]="paramsRecipe">
      <ActionButton
        testID="hooks-push-details-params"
        title="Push Details with params"
        (press)="pushWithParams()"
        [color]="color"
      ></ActionButton>
    </Recipe>
  `,
})
export class RouteParamsRecipe {
  private readonly navigation = injectStackNavigation();

  readonly color = COLOR;
  readonly paramsRecipe = recipeById('hooks-route-params');

  pushWithParams(): void {
    this.navigation.push(ROUTE_NAME.Details, { openedFrom: 'hooks' });
  }
}

// One recipe per question: a one-time mount value against `injectFocusEffect`, `injectIsFocused`,
// the route stack from `injectNavigationState` and params sent with `push`
@Component({
  selector: 'HooksDemoScreen',
  standalone: true,
  imports: [
    FocusEffectRecipe,
    IsFocusedRecipe,
    NavigationStateRecipe,
    RouteParamsRecipe,
    ScreenHero,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <safe-area-view class="screen">
      <scroll-view testID="hooks-scroll" class="screen">
        <view class="scroll-content">
          <ScreenHero
            [route]="route"
            title="Hooks"
            body="Focus and state hooks of the navigator, each one answering a question people search for."
          ></ScreenHero>
          <FocusEffectRecipe></FocusEffectRecipe>
          <IsFocusedRecipe></IsFocusedRecipe>
          <NavigationStateRecipe></NavigationStateRecipe>
          <RouteParamsRecipe></RouteParamsRecipe>
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class HooksDemoScreen {
  readonly route = ROUTE_NAME.HooksDemo;
}
