<script lang="ts">
  import ChoiceRow from '../../components/ChoiceRow.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { SWIPE_AREAS, SWIPE_DIRECTIONS } from './gestures-settings';
  import { useGestures } from './use-gestures';

  const COLOR = LINE_COLOR.presentation;
  const enabledRecipe = recipeById('gestures-enabled');
  const fullScreenRecipe = recipeById('gestures-full-screen');
  const areaRecipe = recipeById('gestures-area');
  const directionRecipe = recipeById('gestures-direction');
  const keyboardRecipe = recipeById('gestures-keyboard');

  // Recipes for the swipe itself: whether it works, where it starts and which way it goes
  const gestures = useGestures();
</script>

<Recipe recipe={enabledRecipe}>
  <SwitchRow
    testID="gestures-enabled"
    label="gestureEnabled"
    value={gestures.settings.isGestureEnabled}
    onChange={isGestureEnabled => gestures.update({ isGestureEnabled })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={fullScreenRecipe}>
  <SwitchRow
    testID="gestures-full-screen"
    label="fullScreenSwipeEnabled"
    value={gestures.settings.isFullScreenSwipe}
    onChange={isFullScreenSwipe => gestures.update({ isFullScreenSwipe })}
    color={COLOR}
  />
  <SwitchRow
    testID="gestures-full-screen-shadow"
    label="fullScreenSwipeShadowEnabled"
    value={gestures.settings.isFullScreenShadow}
    onChange={isFullScreenShadow => gestures.update({ isFullScreenShadow })}
    color={COLOR}
  />
  <SwitchRow
    testID="gestures-custom-animation"
    label="customAnimationOnSwipe"
    value={gestures.settings.isCustomAnimation}
    onChange={isCustomAnimation => gestures.update({ isCustomAnimation })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={areaRecipe}>
  <ChoiceRow
    testID="gestures-area"
    value={gestures.settings.area}
    options={SWIPE_AREAS}
    onChange={area => gestures.update({ area })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={directionRecipe}>
  <ChoiceRow
    testID="gestures-direction"
    value={gestures.settings.swipeDirection}
    options={SWIPE_DIRECTIONS}
    onChange={swipeDirection => gestures.update({ swipeDirection })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={keyboardRecipe}>
  <text-input
    testID="gestures-keyboard-input"
    placeholder="Focus me, then swipe back"
    placeholderTextColor="#41506a"
    class="text-input"
  />
  <SwitchRow
    testID="gestures-keyboard"
    label="hideKeyboardOnSwipe"
    value={gestures.settings.isKeyboardHidden}
    onChange={isKeyboardHidden => gestures.update({ isKeyboardHidden })}
    color={COLOR}
  />
</Recipe>
