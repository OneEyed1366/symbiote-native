<script lang="ts">
  import {
    useStackNavigation,
    useTransitionProgress,
  } from '@symbiote-native/navigation/svelte';
  import type { ITransitionProgress } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { ROUTE_NAME } from '../../routes';
  import { useRouteSettings } from '../use-route-settings.svelte';
  import type { ITransitionSnapshot } from './transition-readout';
  import { readTransitionSettings } from './transition-settings';
  import { createTransitionReadoutLines } from './use-transition-readout';

  const COLOR = LINE_COLOR.introspection;
  const FADE_FROM = 0.2;
  const SCALE_FROM = 0.85;
  const progressRecipe = recipeById('transition-progress-hook');
  const flagsRecipe = recipeById('transition-flags');
  const readoutRecipe = recipeById('transition-readout');
  const heightRecipe = recipeById('transition-header-height');

  function readoutText({ transitions, direction, ticks }: ITransitionSnapshot) {
    if (transitions === 0) return 'No transition has finished yet';
    return `${transitions} finished, the last one ${direction} in ${ticks} ticks`;
  }

  // Everything animated here is a native driven value, so a swipe back redraws it without JS work
  const { progress, closing, goingForward } = useTransitionProgress();
  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [FADE_FROM, 1],
    extrapolate: 'clamp',
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SCALE_FROM, 1],
    extrapolate: 'clamp',
  });
  const navigation = useStackNavigation();
  const readout = createTransitionReadoutLines();
  const height = useRouteSettings(readTransitionSettings);
</script>

{#snippet lamp(testID: string, label: string, value: ITransitionProgress['closing'])}
  <view {testID} class="lamp">
    <view class="lamp-lit" style={{ opacity: value }} />
    <text class="lamp-text">{label}</text>
  </view>
{/snippet}

<Recipe recipe={progressRecipe}>
  <view
    testID="transition-card"
    class="transition-card"
    style={{ opacity, transform: [{ scale }] }}
  >
    <text class="transition-card-text">I follow the progress value</text>
  </view>
</Recipe>
<Recipe recipe={flagsRecipe}>
  <view class="lamp-row">
    {@render lamp('transition-closing', 'closing', closing)}
    {@render lamp('transition-going-forward', 'goingForward', goingForward)}
  </view>
</Recipe>
<Recipe recipe={readoutRecipe}>
  <text testID="transition-readout" class="list-row-text">
    {readoutText(readout.current)}
  </text>
  <ActionButton
    testID="transition-push"
    title="Push Details"
    onPress={() => navigation.current.push(ROUTE_NAME.Details)}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={heightRecipe}>
  <SwitchRow
    testID="transition-translucent"
    label="Translucent header"
    value={height.settings.isTranslucent}
    onChange={isTranslucent => height.update({ isTranslucent })}
    color={COLOR}
  />
  <SwitchRow
    testID="transition-large-title"
    label="Large title"
    value={height.settings.isLargeTitle}
    onChange={isLargeTitle => height.update({ isLargeTitle })}
    color={COLOR}
  />
  <view
    testID="transition-ruler"
    class="ruler"
    style={{ height: readout.current.headerHeight ?? undefined }}
  >
    <text class="list-row-text">
      {readout.current.headerHeight === null
        ? 'Header height not reported yet'
        : `Header height ${readout.current.headerHeight}`}
    </text>
  </view>
</Recipe>
