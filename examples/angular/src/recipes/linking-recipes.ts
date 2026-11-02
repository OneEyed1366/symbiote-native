import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const LINKING_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'linking-resolve',
    route: ROUTE_NAME.DeepLinking,
    question: 'How do I test a deep link without leaving the app?',
    option: 'resolveRouteFromUrl',
    platform: 'all',
    expected:
      'Type a link or tap an example, Resolve prints the screen name and its params, or why nothing matched',
    caveat:
      'It returns null for an unknown prefix and for an unknown path alike, the screen tells them apart',
  },
  {
    id: 'linking-simulator',
    route: ROUTE_NAME.DeepLinking,
    question:
      'How do I open a deep link in the iOS simulator or the Android emulator?',
    option: 'xcrun simctl openurl, adb shell am start',
    platform: 'all',
    expected:
      'The two commands for the typed link appear, run one in a terminal with the app open and the real stack moves',
    caveat:
      'Only the app config is wired to the real stack. On Android add the package name at the end if several apps take the scheme',
  },
  {
    id: 'linking-params',
    route: ROUTE_NAME.DeepLinking,
    question:
      'How do I read an id from the url, and what about the query string?',
    option: 'config.screens with :param',
    platform: 'all',
    expected:
      'A :id segment arrives as a decoded string, a query string and a hash are dropped before matching',
    caveat: 'Values are strings, there are no query params in the route',
  },
  {
    id: 'linking-specificity',
    route: ROUTE_NAME.DeepLinking,
    question: 'Why does user/me not open the profile of the user called me?',
    option: 'fixed path against :param path',
    platform: 'all',
    expected:
      'user/me opens the fixed Me screen, user/42 opens Profile, the fixed path wins',
  },
  {
    id: 'linking-nested',
    route: ROUTE_NAME.DeepLinking,
    question: 'How do I write the links config for nested screens?',
    option: 'config.screens with path and nested screens',
    platform: 'all',
    expected:
      'settings/privacy resolves to Privacy, the group path is joined in front, the bare settings opens nothing',
    caveat:
      'The stack is flat: a group is a path prefix, it does not open a navigator of its own',
  },
  {
    id: 'linking-reverse',
    route: ROUTE_NAME.DeepLinking,
    question: 'How do I build a link to a screen, to share it?',
    option: 'resolveUrlFromRoute',
    platform: 'all',
    expected:
      'Under the result the link the route turns back into, the first prefix is used, no link when a param is missing',
  },
  {
    id: 'linking-wiring',
    route: ROUTE_NAME.DeepLinking,
    question:
      'What happens when a link opens the app, and when the app is already running?',
    option: 'useLinkingIntegration',
    platform: 'all',
    expected:
      'A link that starts the app replaces the first screen, a link while it runs pushes a screen on the stack',
    caveat: 'A link no route matches is logged and ignored',
  },
];
