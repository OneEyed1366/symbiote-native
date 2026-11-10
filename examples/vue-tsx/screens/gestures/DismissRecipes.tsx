import { defineComponent } from 'vue';
import { ActionButton } from '../../components/ActionButton';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';
import { useGestures } from './use-gestures';

const COLOR = LINE_COLOR.presentation;
const preventRecipe = recipeById('gestures-prevent');
const cancelRecipe = recipeById('gestures-cancel');
const androidBackRecipe = recipeById('gestures-android-back');

// Recipes for leaving the screen: stopping it, noticing a cancelled swipe, the Android back press
export const DismissRecipes = defineComponent(
  () => {
    const { settings, update, navigation } = useGestures();
    return () => (
      <>
        <Recipe recipe={preventRecipe}>
          <SwitchRow
            testID="gestures-prevent"
            label="preventNativeDismiss"
            value={settings.value.isDismissPrevented}
            onChange={isDismissPrevented => update({ isDismissPrevented })}
            color={COLOR}
          />
          <text testID="gestures-attempts" class="info-text">
            {`dismissals stopped: ${settings.value.dismissAttempts}`}
          </text>
          <ActionButton
            testID="gestures-leave"
            title="Leave anyway"
            onPress={() => navigation.value.pop()}
            color={COLOR}
          />
          <ActionButton
            testID="gestures-open-modal"
            title="Open this screen as a modal"
            onPress={() =>
              navigation.value.push(ROUTE_NAME.Gestures, { isModal: true })
            }
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={cancelRecipe}>
          <text testID="gestures-cancels" class="info-text">
            {`swipes let go: ${settings.value.gestureCancels}`}
          </text>
        </Recipe>
        <Recipe recipe={androidBackRecipe}>
          <SwitchRow
            testID="gestures-android-back"
            label="nativeBackButtonDismissalEnabled"
            value={settings.value.isNativeBackDismissal}
            onChange={isNativeBackDismissal =>
              update({ isNativeBackDismissal })
            }
            color={COLOR}
          />
        </Recipe>
      </>
    );
  },
  { name: 'DismissRecipes' },
);
