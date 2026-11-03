import { Dimensions } from '@symbiote-native/react';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/react';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { DismissRecipes } from './gestures/DismissRecipes';
import {
  gestureOptionsOf,
  readGesturesSettings,
} from './gestures/gestures-settings';
import { SwipeRecipes } from './gestures/SwipeRecipes';

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

export function GesturesScreen() {
  return (
    <scroll-view
      testID="gestures-scroll"
      className="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view className="scroll-content">
        <ScreenHero
          route={ROUTE_NAME.Gestures}
          title="Gestures"
          body="How the user leaves a screen and how you stop or watch it. This screen is the one you swipe, so try each switch on it."
        />
        <SwipeRecipes />
        <DismissRecipes />
      </view>
    </scroll-view>
  );
}
