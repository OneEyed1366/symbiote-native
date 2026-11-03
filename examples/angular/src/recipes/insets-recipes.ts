import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const INSETS_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'insets-status-style',
    route: ROUTE_NAME.InsetsStatusBar,
    question: 'How do I make the status bar text light or dark on one screen?',
    option: 'statusBarStyle',
    platform: 'all',
    expected:
      'Light text shows on the dark header, dark text almost disappears into it',
    caveat:
      'auto and inverted exist on iOS only, Android falls back to light. iOS needs View controller-based status bar appearance on in Info.plist',
  },
  {
    id: 'insets-status-hidden',
    route: ROUTE_NAME.InsetsStatusBar,
    question:
      'How do I hide the status bar on one screen, with or without animation?',
    option: 'statusBarHidden, statusBarAnimation',
    platform: 'all',
    expected:
      'The clock and battery vanish when the switch is on, with the chosen fade or slide',
    caveat: 'The animation defaults to fade on iOS and none on Android',
  },
  {
    id: 'insets-orientation',
    route: ROUTE_NAME.InsetsStatusBar,
    question: 'How do I lock the orientation of one screen only?',
    option: 'screenOrientation',
    platform: 'all',
    expected:
      'Rotate the device: portrait keeps the screen upright, landscape turns it and refuses upright',
    caveat:
      'default lets the system decide on Android. iOS only rotates into orientations the app lists in Info.plist',
  },
  {
    id: 'insets-home-indicator',
    route: ROUTE_NAME.InsetsStatusBar,
    question:
      'How do I hide the home indicator bar at the bottom of the iPhone?',
    option: 'homeIndicatorHidden',
    platform: 'ios',
    expected: 'The bar at the bottom edge fades out until you touch the screen',
  },
  {
    id: 'insets-navigation-bar',
    route: ROUTE_NAME.InsetsStatusBar,
    question: 'How do I hide the Android navigation bar on one screen?',
    option: 'navigationBarHidden',
    platform: 'android',
    expected: 'The three button or gesture bar leaves the bottom of the screen',
  },
  {
    id: 'insets-safe-area-edges',
    route: ROUTE_NAME.InsetsStatusBar,
    question:
      'How do I stop content from going under the home indicator or the sides?',
    option: 'safeAreaEdges',
    platform: 'ios26',
    expected:
      'An edge set to inset leaves a gap there, ignore lets the content reach the screen edge',
    caveat:
      'An edge left on default keeps its own value, the top is inset under an opaque visible header',
  },
  {
    id: 'insets-scroll-edge',
    route: ROUTE_NAME.InsetsStatusBar,
    question: 'How do I change the blur where a list scrolls under the header?',
    option: 'scrollEdgeEffects',
    platform: 'ios26',
    expected:
      'Scroll this screen: hard draws a line under the header, soft fades, hidden shows nothing',
    caveat:
      'Only the first scroll view of the screen reacts. With a header blurEffect the two effects can overlap',
  },
  {
    id: 'insets-disable-inset',
    route: ROUTE_NAME.InsetsStatusBar,
    question: 'Why is my Android screen padded twice by the system bars?',
    option:
      'disableTopInsetApplication, disableLeftInsetApplication, disableRightInsetApplication, disableBottomInsetApplication',
    platform: 'android',
    expected:
      'On the outermost visible header, the chosen edge stops being padded for the whole subtree',
    caveat:
      'It shows with a header inside another header, an opt-out cannot be undone by a child',
  },
  {
    id: 'insets-header-style',
    route: ROUTE_NAME.InsetsStatusBar,
    question:
      'Why does my header follow the system dark mode and not my theme?',
    option: 'headerUserInterfaceStyle',
    platform: 'ios',
    expected:
      'Back button and title text flip between light and dark whatever the system mode is',
  },
  {
    id: 'insets-removed-colors',
    route: ROUTE_NAME.InsetsStatusBar,
    question: 'Why does statusBarColor do nothing on Android?',
    option:
      'statusBarColor, statusBarTranslucent, navigationBarColor, navigationBarTranslucent, headerTopInsetEnabled',
    platform: 'android',
    expected:
      'Switching it on changes nothing on Android 15 and later, the options stay accepted for older apps',
    caveat:
      'Apps targeting SDK 35 are edge-to-edge, the system bars cannot be painted',
  },
];
