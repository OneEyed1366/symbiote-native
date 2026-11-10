import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const NATIVE_TABS_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'native-tabs-hidden',
    route: ROUTE_NAME.NativeTabs,
    question: 'How do I hide the tab bar on one screen?',
    option: 'tabBarHidden',
    platform: 'all',
    expected:
      'The bar disappears at once on the switch and comes back when it is off',
  },
  {
    id: 'native-tabs-minimize',
    route: ROUTE_NAME.NativeTabs,
    question: 'How do I shrink the tab bar while the list scrolls?',
    option: 'ios.tabBarMinimizeBehavior',
    platform: 'ios26',
    expected:
      'On Feed, scroll down: onScrollDown collapses the bar, scrolling up brings it back, never keeps it',
    caveat: 'A list too short to scroll collapses nothing',
  },
  {
    id: 'native-tabs-accessory',
    route: ROUTE_NAME.NativeTabs,
    question: 'How do I put a now-playing bar above the tab bar?',
    option: 'ios.bottomAccessory(environment)',
    platform: 'ios26',
    expected:
      'A strip sits above the bar and reads regular, once the bar collapses on Feed it reads inline',
    caveat: 'bottomAccessoryHidden hides the strip, the switch drives it',
  },
  {
    id: 'native-tabs-controller-mode',
    route: ROUTE_NAME.NativeTabs,
    question: 'How do I get a sidebar on iPad instead of a bottom bar?',
    option: 'ios.tabBarControllerMode, ios.tabBarSidebarPreferredPlacement',
    platform: 'ios',
    expected:
      'On iPad tabSidebar shows a sidebar and its toggle, tabBar keeps the floating bar, iPhone does not change',
  },
  {
    id: 'native-tabs-badge',
    route: ROUTE_NAME.NativeTabs,
    question: 'How do I show an unread count on a tab?',
    option: 'badgeValue',
    platform: 'all',
    expected:
      'The Inbox tab shows the text, clearing the field removes the badge',
    caveat: 'Android renders at most 4 characters, a longer number reads 999+',
  },
  {
    id: 'native-tabs-prevent',
    route: ROUTE_NAME.NativeTabs,
    question: 'How do I block a tab press, for a paywall or an unsaved form?',
    option: 'preventNativeSelection, onTabSelectionPrevented',
    platform: 'all',
    expected:
      'Tap Locked: it does not open and the log names it, the Open Locked button still switches to it',
    caveat: 'Only the native press is blocked, jumpTo goes through',
  },
  {
    id: 'native-tabs-retap',
    route: ROUTE_NAME.NativeTabs,
    question: 'How do I scroll to the top when the active tab is tapped again?',
    option: 'specialEffects.repeatedTabSelection',
    platform: 'all',
    expected:
      'Scroll Feed down and tap Feed again: the list returns to the top when scrollToTop is on',
  },
  {
    id: 'native-tabs-search',
    route: ROUTE_NAME.NativeTabs,
    question: 'How do I get the separate search tab of iOS 26?',
    option: 'ios.role: search',
    platform: 'ios',
    expected:
      'On iOS 26 the Search tab sits apart from the others, on iOS 18 it stays in the bar with a label',
  },
  {
    id: 'native-tabs-icons',
    route: ROUTE_NAME.NativeTabs,
    question: 'How do I use SF Symbols and a different icon when selected?',
    option: 'ios.icon, ios.selectedIcon',
    platform: 'ios',
    expected:
      'Each tab shows its symbol, the selected one switches to the filled variant',
    caveat: 'Android takes android.icon, a drawable resource name or an image',
  },
  {
    id: 'native-tabs-events',
    route: ROUTE_NAME.NativeTabs,
    question: 'Which events fire when the user switches tabs?',
    option:
      'onWillAppear, onDidAppear, onWillDisappear, onDidDisappear, onTabSelected',
    platform: 'all',
    expected:
      'Each switch adds four lifecycle lines and one selection line to the log',
    caveat: 'iOS starts with the new tab, Android with the old one leaving',
  },
  {
    id: 'native-tabs-scheme',
    route: ROUTE_NAME.NativeTabs,
    question: 'How do I force a light or dark tab bar, or right to left?',
    option: 'colorScheme, direction, ios.tabBarTintColor',
    platform: 'all',
    expected: 'The bar flips to the chosen scheme, rtl reverses the tab order',
  },
];
