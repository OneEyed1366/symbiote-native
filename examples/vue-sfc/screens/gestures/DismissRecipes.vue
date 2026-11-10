<!-- Recipes for leaving the screen: stopping it, a cancelled swipe, the Android back press -->
<script setup lang="ts">
import ActionButton from '../../components/ActionButton.vue';
import Recipe from '../../components/Recipe.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';
import { useGestures } from './use-gestures';

const COLOR = LINE_COLOR.presentation;
const preventRecipe = recipeById('gestures-prevent');
const cancelRecipe = recipeById('gestures-cancel');
const androidBackRecipe = recipeById('gestures-android-back');

const { settings, update, navigation } = useGestures();
</script>

<template>
  <Recipe :recipe="preventRecipe">
    <SwitchRow
      testID="gestures-prevent"
      label="preventNativeDismiss"
      :value="settings.isDismissPrevented"
      :onChange="isDismissPrevented => update({ isDismissPrevented })"
      :color="COLOR"
    />
    <text testID="gestures-attempts" class="info-text">
      {{ `dismissals stopped: ${settings.dismissAttempts}` }}
    </text>
    <ActionButton
      testID="gestures-leave"
      title="Leave anyway"
      :onPress="() => navigation.pop()"
      :color="COLOR"
    />
    <ActionButton
      testID="gestures-open-modal"
      title="Open this screen as a modal"
      :onPress="() => navigation.push(ROUTE_NAME.Gestures, { isModal: true })"
      :color="COLOR"
    />
  </Recipe>
  <Recipe :recipe="cancelRecipe">
    <text testID="gestures-cancels" class="info-text">
      {{ `swipes let go: ${settings.gestureCancels}` }}
    </text>
  </Recipe>
  <Recipe :recipe="androidBackRecipe">
    <SwitchRow
      testID="gestures-android-back"
      label="nativeBackButtonDismissalEnabled"
      :value="settings.isNativeBackDismissal"
      :onChange="isNativeBackDismissal => update({ isNativeBackDismissal })"
      :color="COLOR"
    />
  </Recipe>
</template>
