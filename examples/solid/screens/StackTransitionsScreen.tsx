import { Show } from 'solid-js';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/solid';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { MethodRecipes } from './stack-transitions/MethodRecipes';
import { PresentationRecipes } from './stack-transitions/PresentationRecipes';
import { probeOptionsOf, readProbe } from './stack-transitions/probe';
import { useProbe } from './stack-transitions/use-probe';

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

const CONTAINED_NOTE =
  'The contained presentations open in the context of a parent screen. A root stack shows a blank screen with no way back, so nothing is pushed while one is chosen.';

function Readout() {
  const { probe, stackSize, canPush } = useProbe();
  const entered = () =>
    probe().isProbe
      ? `entered as ${probe().presentation}, ${probe().animation}, ${probe().duration}`
      : 'the first screen of the experiment';
  return (
    <view testID="stack-readout" class="recipe">
      <text class="recipe-question">{`Depth ${probe().depth}, ${stackSize()} screens in the stack`}</text>
      <text class="info-text">{entered()}</text>
      <Show when={!canPush()}>
        <text testID="stack-contained-note" class="note-text">
          {CONTAINED_NOTE}
        </text>
      </Show>
    </view>
  );
}

export function StackTransitionsScreen() {
  return (
    <scroll-view
      testID="stack-scroll"
      class="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view class="scroll-content">
        <ScreenHero
          route={ROUTE_NAME.StackTransitions}
          title="Stack transitions"
          body="Choose how the next screen arrives, push it, then go back in every way the stack allows. Each probe is this screen again."
        />
        <Readout />
        <PresentationRecipes />
        <MethodRecipes />
      </view>
    </scroll-view>
  );
}
