<script lang="ts" module>
  import { Dimensions } from '@symbiote-native/svelte';
  import type { IScreenOptionsResolver } from '@symbiote-native/navigation/svelte';
  import { LINE_COLOR } from '../navigation-lines';
  import {
    gestureOptionsOf,
    readGesturesSettings,
  } from './gestures/gestures-settings';

  // The route params hold the panel state, so every switch re-runs this resolver
  export const gesturesScreenOptions: IScreenOptionsResolver = ({
    route,
    navigation,
  }) => {
    const settings = readGesturesSettings(route.params);
    return {
      title: settings.isModal ? 'Gestures (modal)' : 'Gestures',
      headerShown: true,
      headerTintColor: LINE_COLOR.presentation,
      headerTitleColor: '#ffffff',
      headerStyle: { backgroundColor: '#0b1622' },
      headerUserInterfaceStyle: 'dark',
      ...gestureOptionsOf(settings, Dimensions.get('window')),
      onNativeDismissCancelled: () =>
        navigation.setParams({ dismissAttempts: settings.dismissAttempts + 1 }),
      onGestureCancel: () =>
        navigation.setParams({ gestureCancels: settings.gestureCancels + 1 }),
    };
  };
</script>

<script lang="ts">
  import ScreenHero from '../components/ScreenHero.svelte';
  import { ROUTE_NAME } from '../routes';
  import DismissRecipes from './gestures/DismissRecipes.svelte';
  import SwipeRecipes from './gestures/SwipeRecipes.svelte';
</script>

<scroll-view
  testID="gestures-scroll"
  class="screen"
  contentInsetAdjustmentBehavior="automatic"
>
  <view class="scroll-content">
    <ScreenHero
      route={ROUTE_NAME.Gestures}
      title="Gestures"
      body="How the user leaves a screen and how you stop or watch it. This screen is the one you swipe, so try each switch on it."
    />
    <SwipeRecipes />
    <DismissRecipes />
  </view>
</scroll-view>
