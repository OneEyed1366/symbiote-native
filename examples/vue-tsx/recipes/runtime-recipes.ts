import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const RUNTIME_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'runtime-enable-screens',
    route: ROUTE_NAME.RuntimeConfig,
    question: 'What does enableScreens(false) turn off?',
    option: 'enableScreens(), screensEnabled()',
    platform: 'all',
    expected:
      'With the switch off a container without its own enabled prop is drawn as a plain view, with it on it is a native screen container',
    caveat:
      'The stack does not read it, only ScreenContainer does. Leaving this screen puts the old value back',
  },
  {
    id: 'runtime-feature-flags',
    route: ROUTE_NAME.RuntimeConfig,
    question: 'What are the experimental feature flags and can I change them?',
    option: 'featureFlags.experiment, featureFlags.stable',
    platform: 'all',
    expected:
      'Each row shows the live value and what it does, the retired ones stay true whatever you set',
    caveat:
      'Set a flag once at startup: changing it a second time logs an error. A screen can override some of them',
  },
  {
    id: 'runtime-compat-flags',
    route: ROUTE_NAME.RuntimeConfig,
    question:
      'How does a navigation library know which screens version it runs on?',
    option: 'compatibilityFlags',
    platform: 'all',
    expected:
      'Each row names a behaviour this version has, all of them read true here',
  },
  {
    id: 'runtime-search-bar',
    route: ROUTE_NAME.RuntimeConfig,
    question: 'Why is the header search bar missing on my platform?',
    option: 'isSearchBarAvailableForCurrentPlatform',
    platform: 'all',
    expected: 'The row reads true on iOS and Android and false anywhere else',
  },
  {
    id: 'runtime-legacy-inset',
    route: ROUTE_NAME.RuntimeConfig,
    question: 'Why is the Android top padding different from the old version?',
    option: 'headerLegacyTopInsetBehavior',
    platform: 'android',
    expected:
      'On with the switch, this header pads the top even when an outer header already did, off follows the global flag',
    caveat: 'A per-screen override of the androidLegacyTopInsetBehavior flag',
  },
  {
    id: 'runtime-native-back',
    route: ROUTE_NAME.RuntimeConfig,
    question: 'How do I run the system back press by hand on Android?',
    option: 'executeNativeBackPress()',
    platform: 'android',
    expected: 'There is nothing to press: the call closes the whole app',
    caveat:
      'It exits through BackHandler.exitApp, so a demo button would end this session',
  },
];
