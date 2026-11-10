import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const GESTURES_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'gestures-enabled',
    route: ROUTE_NAME.Gestures,
    question: 'How do I turn off swipe back on one screen?',
    option: 'gestureEnabled',
    platform: 'ios',
    expected:
      'With the switch off the edge swipe no longer pops this screen, the header back button still does',
    caveat: 'A stack higher up may pick the swipe up instead',
  },
  {
    id: 'gestures-full-screen',
    route: ROUTE_NAME.Gestures,
    question: 'How do I swipe back from anywhere, not only from the edge?',
    option:
      'fullScreenSwipeEnabled, fullScreenSwipeShadowEnabled, customAnimationOnSwipe',
    platform: 'ios',
    expected:
      'A swipe that starts mid-screen pops it, the shadow switch changes the edge of the moving screen',
    caveat:
      'On iOS 26 the shadow switch is ignored, and a scrolling list was reported to misbehave with this on',
  },
  {
    id: 'gestures-area',
    route: ROUTE_NAME.Gestures,
    question: 'How do I limit where the swipe is allowed to start?',
    option: 'gestureResponseDistance',
    platform: 'ios',
    expected:
      'With the lower half chosen a swipe from the upper half does nothing, the middle column ignores both sides',
    caveat: 'It works alongside fullScreenSwipeEnabled',
  },
  {
    id: 'gestures-direction',
    route: ROUTE_NAME.Gestures,
    question: 'How do I make a screen go away with a swipe down?',
    option: 'swipeDirection',
    platform: 'ios',
    expected:
      'With vertical a swipe down pops the screen, with horizontal a swipe from the left edge does',
    caveat:
      'Vertical also turns on the full screen swipe and the slide from the bottom',
  },
  {
    id: 'gestures-keyboard',
    route: ROUTE_NAME.Gestures,
    question: 'How do I hide the keyboard when the user swipes back?',
    option: 'hideKeyboardOnSwipe',
    platform: 'ios',
    expected:
      'Focus the field, swipe back: the keyboard hides with the switch on and stays up with it off',
  },
  {
    id: 'gestures-prevent',
    route: ROUTE_NAME.Gestures,
    question: 'How do I stop the user leaving with unsaved changes?',
    option: 'preventNativeDismiss, onNativeDismissCancelled',
    platform: 'ios',
    expected:
      'With the switch on a swipe back or the back button leaves the screen in place and the counter grows, Leave anyway pops it',
    caveat: 'This port has no usePreventRemove, the native flag is the way',
  },
  {
    id: 'gestures-cancel',
    route: ROUTE_NAME.Gestures,
    question: 'How do I know a swipe back was started and let go?',
    option: 'onGestureCancel',
    platform: 'ios',
    expected:
      'Start the edge swipe and release before it finishes: the counter grows',
  },
  {
    id: 'gestures-android-back',
    route: ROUTE_NAME.Gestures,
    question: 'How do I intercept the Android back button?',
    option: 'nativeBackButtonDismissalEnabled',
    platform: 'android',
    expected:
      'Off (the default) the header back press goes to JS where it can be prevented, on it pops natively',
  },
];
