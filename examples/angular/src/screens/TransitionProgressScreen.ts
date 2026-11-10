import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/angular';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import {
  HeaderHeightRecipe,
  ProgressRecipes,
  ReadoutRecipe,
} from './transition/TransitionRecipes';
import {
  readTransitionSettings,
  transitionOptionsOf,
} from './transition/transition-settings';
import { transitionReadout } from './transition/use-transition-readout';

// The panel writes the header switches to the route params, the callbacks feed the readout
export const transitionProgressScreenOptions: IScreenOptionsResolver = ({
  route,
}) => ({
  title: 'Transition progress',
  headerShown: true,
  headerTintColor: LINE_COLOR.introspection,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  ...transitionOptionsOf(readTransitionSettings(route.params)),
  onTransitionProgress: payload => transitionReadout.recordProgress(payload),
  onHeaderHeightChange: ({ headerHeight }) =>
    transitionReadout.recordHeaderHeight(headerHeight),
});

@Component({
  selector: 'TransitionProgressScreen',
  standalone: true,
  imports: [
    HeaderHeightRecipe,
    ProgressRecipes,
    ReadoutRecipe,
    ScreenHero,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <scroll-view
      testID="transition-scroll"
      class="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view class="scroll-content">
        <ScreenHero
          [route]="route"
          title="Transition progress"
          body="What a push, a pop and a swipe back report while they run, and the header height they leave behind."
        ></ScreenHero>
        <ProgressRecipes></ProgressRecipes>
        <ReadoutRecipe></ReadoutRecipe>
        <HeaderHeightRecipe></HeaderHeightRecipe>
      </view>
    </scroll-view>
  `,
})
export class TransitionProgressScreen {
  readonly route = ROUTE_NAME.TransitionProgress;
}
