<script lang="ts">
  import LabeledChoice from '../../components/LabeledChoice.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { useRouteSettings } from '../use-route-settings.svelte';
  import {
    readInsetsSettings,
    SCREEN_ORIENTATIONS,
    STATUS_BAR_ANIMATIONS,
    STATUS_BAR_STYLES,
  } from './insets-settings';
  import { IS_STATUS_BAR_SETTABLE } from './status-bar-support';

  const COLOR = LINE_COLOR.presentation;
  const styleRecipe = recipeById('insets-status-style');
  const hiddenRecipe = recipeById('insets-status-hidden');
  const orientationRecipe = recipeById('insets-orientation');
  const indicatorRecipe = recipeById('insets-home-indicator');
  const navigationBarRecipe = recipeById('insets-navigation-bar');

  // The bars around the screen: status bar, orientation, home indicator, Android navigation bar
  const insets = useRouteSettings(readInsetsSettings);
</script>

{#snippet notSettable()}
  <text class="info-text">
    This app keeps UIViewControllerBasedStatusBarAppearance off for the React Native StatusBar demo, so on iOS this option would raise a red box. Turn the key on in Info.plist to try it.
  </text>
{/snippet}

<Recipe recipe={styleRecipe}>
  {#if IS_STATUS_BAR_SETTABLE}
    <LabeledChoice
      testID="insets-status-style"
      label="statusBarStyle"
      value={insets.settings.statusBarStyle}
      options={STATUS_BAR_STYLES}
      onChange={statusBarStyle => insets.update({ statusBarStyle })}
      color={COLOR}
    />
  {:else}
    {@render notSettable()}
  {/if}
</Recipe>
<Recipe recipe={hiddenRecipe}>
  {#if IS_STATUS_BAR_SETTABLE}
    <SwitchRow
      testID="insets-status-hidden"
      label="statusBarHidden"
      value={insets.settings.isStatusBarHidden}
      onChange={isStatusBarHidden => insets.update({ isStatusBarHidden })}
      color={COLOR}
    />
    <LabeledChoice
      testID="insets-status-animation"
      label="statusBarAnimation"
      value={insets.settings.statusBarAnimation}
      options={STATUS_BAR_ANIMATIONS}
      onChange={statusBarAnimation => insets.update({ statusBarAnimation })}
      color={COLOR}
    />
  {:else}
    {@render notSettable()}
  {/if}
</Recipe>
<Recipe recipe={orientationRecipe}>
  <LabeledChoice
    testID="insets-orientation"
    label="screenOrientation"
    value={insets.settings.screenOrientation}
    options={SCREEN_ORIENTATIONS}
    onChange={screenOrientation => insets.update({ screenOrientation })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={indicatorRecipe}>
  <SwitchRow
    testID="insets-home-indicator"
    label="homeIndicatorHidden"
    value={insets.settings.isHomeIndicatorHidden}
    onChange={isHomeIndicatorHidden =>
      insets.update({ isHomeIndicatorHidden })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={navigationBarRecipe}>
  <SwitchRow
    testID="insets-navigation-bar"
    label="navigationBarHidden"
    value={insets.settings.isNavigationBarHidden}
    onChange={isNavigationBarHidden =>
      insets.update({ isNavigationBarHidden })}
    color={COLOR}
  />
</Recipe>
