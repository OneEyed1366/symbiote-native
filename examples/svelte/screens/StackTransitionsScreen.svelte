<script lang="ts" module>
  import type { IScreenOptionsResolver } from '@symbiote-native/navigation/svelte';
  import { LINE_COLOR } from '../navigation-lines';
  import { probeOptionsOf, readProbe } from './stack-transitions/probe';

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
</script>

<script lang="ts">
  import ScreenHero from '../components/ScreenHero.svelte';
  import { ROUTE_NAME } from '../routes';
  import MethodRecipes from './stack-transitions/MethodRecipes.svelte';
  import PresentationRecipes from './stack-transitions/PresentationRecipes.svelte';
  import { useProbe } from './stack-transitions/use-probe.svelte';

  const CONTAINED_NOTE =
    'The contained presentations open in the context of a parent screen. A root stack shows a blank screen with no way back, so nothing is pushed while one is chosen.';

  const stack = useProbe();
  const entered = $derived(
    stack.probe.isProbe
      ? `entered as ${stack.probe.presentation}, ${stack.probe.animation}, ${stack.probe.duration}`
      : 'the first screen of the experiment',
  );
</script>

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
    <view testID="stack-readout" class="recipe">
      <text class="recipe-question">
        {`Depth ${stack.probe.depth}, ${stack.stackSize} screens in the stack`}
      </text>
      <text class="info-text">{entered}</text>
      {#if !stack.canPush}
        <text testID="stack-contained-note" class="note-text">
          {CONTAINED_NOTE}
        </text>
      {/if}
    </view>
    <PresentationRecipes />
    <MethodRecipes />
  </view>
</scroll-view>
