import { defineComponent } from 'vue';
import { ChoiceRow } from '../../components/ChoiceRow';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
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
export const SwipeRecipes = defineComponent(
  () => {
    const { settings, update } = useGestures();
    return () => (
      <>
        <Recipe recipe={enabledRecipe}>
          <SwitchRow
            testID="gestures-enabled"
            label="gestureEnabled"
            value={settings.value.isGestureEnabled}
            onChange={isGestureEnabled => update({ isGestureEnabled })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={fullScreenRecipe}>
          <SwitchRow
            testID="gestures-full-screen"
            label="fullScreenSwipeEnabled"
            value={settings.value.isFullScreenSwipe}
            onChange={isFullScreenSwipe => update({ isFullScreenSwipe })}
            color={COLOR}
          />
          <SwitchRow
            testID="gestures-full-screen-shadow"
            label="fullScreenSwipeShadowEnabled"
            value={settings.value.isFullScreenShadow}
            onChange={isFullScreenShadow => update({ isFullScreenShadow })}
            color={COLOR}
          />
          <SwitchRow
            testID="gestures-custom-animation"
            label="customAnimationOnSwipe"
            value={settings.value.isCustomAnimation}
            onChange={isCustomAnimation => update({ isCustomAnimation })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={areaRecipe}>
          <ChoiceRow
            testID="gestures-area"
            value={settings.value.area}
            options={SWIPE_AREAS}
            onChange={area => update({ area })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={directionRecipe}>
          <ChoiceRow
            testID="gestures-direction"
            value={settings.value.swipeDirection}
            options={SWIPE_DIRECTIONS}
            onChange={swipeDirection => update({ swipeDirection })}
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
            value={settings.value.isKeyboardHidden}
            onChange={isKeyboardHidden => update({ isKeyboardHidden })}
            color={COLOR}
          />
        </Recipe>
      </>
    );
  },
  { name: 'SwipeRecipes' },
);
