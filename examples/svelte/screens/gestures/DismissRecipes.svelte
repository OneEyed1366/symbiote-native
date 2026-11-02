<script lang="ts">
  import ActionButton from '../../components/ActionButton.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { ROUTE_NAME } from '../../routes';
  import { useGestures } from './use-gestures';

  const COLOR = LINE_COLOR.presentation;
  const preventRecipe = recipeById('gestures-prevent');
  const cancelRecipe = recipeById('gestures-cancel');
  const androidBackRecipe = recipeById('gestures-android-back');

  // Recipes for leaving the screen: stopping it, noticing a cancelled swipe, the Android back press
  const gestures = useGestures();
</script>

<Recipe recipe={preventRecipe}>
  <SwitchRow
    testID="gestures-prevent"
    label="preventNativeDismiss"
    value={gestures.settings.isDismissPrevented}
    onChange={isDismissPrevented => gestures.update({ isDismissPrevented })}
    color={COLOR}
  />
  <text testID="gestures-attempts" class="info-text">
    {`dismissals stopped: ${gestures.settings.dismissAttempts}`}
  </text>
  <ActionButton
    testID="gestures-leave"
    title="Leave anyway"
    onPress={() => gestures.navigation.current.pop()}
    color={COLOR}
  />
  <ActionButton
    testID="gestures-open-modal"
    title="Open this screen as a modal"
    onPress={() =>
      gestures.navigation.current.push(ROUTE_NAME.Gestures, { isModal: true })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={cancelRecipe}>
  <text testID="gestures-cancels" class="info-text">
    {`swipes let go: ${gestures.settings.gestureCancels}`}
  </text>
</Recipe>
<Recipe recipe={androidBackRecipe}>
  <SwitchRow
    testID="gestures-android-back"
    label="nativeBackButtonDismissalEnabled"
    value={gestures.settings.isNativeBackDismissal}
    onChange={isNativeBackDismissal =>
      gestures.update({ isNativeBackDismissal })}
    color={COLOR}
  />
</Recipe>
