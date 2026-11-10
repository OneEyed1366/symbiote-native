import { Component, computed } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/angular';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { MethodRecipes } from './stack-transitions/MethodRecipes';
import { PresentationRecipes } from './stack-transitions/PresentationRecipes';
import { probeOptionsOf, readProbe } from './stack-transitions/probe';
import { injectProbe } from './stack-transitions/use-probe';

// A probe is this route pushed again, its params decide how it enters and leaves
export const stackTransitionsScreenOptions: IScreenOptionsResolver = ({
  route,
}) => {
  const probe = readProbe(route.params);
  return {
    title: probe.isProbe ? `Probe ${probe.depth}` : 'Stack transitions',
    headerShown: true,
    headerTintColor: LINE_COLOR.routing,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#0b1622' },
    headerUserInterfaceStyle: 'dark',
    ...probeOptionsOf(probe),
  };
};

@Component({
  selector: 'Readout',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view testID="stack-readout" class="recipe">
      <text class="recipe-question">{{ depthText() }}</text>
      <text class="info-text">{{ entered() }}</text>
      @if (!canPush()) {
        <text testID="stack-contained-note" class="note-text">{{ note }}</text>
      }
    </view>
  `,
})
export class Readout {
  private readonly probeState = injectProbe();

  readonly canPush = this.probeState.canPush;
  readonly note =
    'The contained presentations open in the context of a parent screen. A root stack shows a blank screen with no way back, so nothing is pushed while one is chosen.';
  readonly depthText = computed(
    () =>
      `Depth ${this.probeState.probe().depth}, ${this.probeState.stackSize()} screens in the stack`,
  );
  readonly entered = computed(() => {
    const probe = this.probeState.probe();
    return probe.isProbe
      ? `entered as ${probe.presentation}, ${probe.animation}, ${probe.duration}`
      : 'the first screen of the experiment';
  });
}

@Component({
  selector: 'StackTransitionsScreen',
  standalone: true,
  imports: [
    MethodRecipes,
    PresentationRecipes,
    Readout,
    ScreenHero,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <scroll-view
      testID="stack-scroll"
      class="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view class="scroll-content">
        <ScreenHero
          [route]="route"
          title="Stack transitions"
          body="Choose how the next screen arrives, push it, then go back in every way the stack allows. Each probe is this screen again."
        ></ScreenHero>
        <Readout></Readout>
        <PresentationRecipes></PresentationRecipes>
        <MethodRecipes></MethodRecipes>
      </view>
    </scroll-view>
  `,
})
export class StackTransitionsScreen {
  readonly route = ROUTE_NAME.StackTransitions;
}
