import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const HEADER_VIEWS_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'header-views-custom',
    route: ROUTE_NAME.HeaderViews,
    question: 'How do I put my own button or logo in the header?',
    option: 'headerLeft, headerRight, headerTitle',
    platform: 'all',
    expected:
      'Each switch to view replaces the plain title, back button or empty right side with a tappable view',
    caveat: 'A custom headerLeft takes the place of the back button',
  },
  {
    id: 'header-views-back-title',
    route: ROUTE_NAME.HeaderViews,
    question: 'How do I shorten or rename the back button text?',
    option: 'headerBackTitle, headerBackButtonDisplayMode',
    platform: 'ios',
    expected:
      'minimal leaves the arrow alone, generic reads Back, custom reads Menu, default shows the previous screen title',
  },
  {
    id: 'header-views-back-visible',
    route: ROUTE_NAME.HeaderViews,
    question: 'How do I hide the back button or its long-press menu?',
    option: 'headerBackVisible, headerBackButtonMenuEnabled',
    platform: 'all',
    expected:
      'With the back button off the arrow disappears, with the menu off a long press on it lists nothing',
    caveat: 'The long-press menu exists on iOS only',
  },
  {
    id: 'header-views-back-image',
    route: ROUTE_NAME.HeaderViews,
    question: 'How do I use my own back arrow?',
    option: 'headerBackImageSource',
    platform: 'all',
    expected: 'The switch swaps the system arrow for a small custom image',
  },
  {
    id: 'header-views-translucent',
    route: ROUTE_NAME.HeaderViews,
    question: 'How do I get a blurred header with content scrolling under it?',
    option: 'headerTranslucent, headerBlurEffect',
    platform: 'ios',
    expected:
      'Translucent lets the list slide under the bar, a blur effect then frosts what passes beneath',
    caveat:
      'The blur shows only on a translucent header with a transparent background colour, the switch sets both here',
  },
  {
    id: 'header-views-large-title',
    route: ROUTE_NAME.HeaderViews,
    question: 'Why does my large title not collapse when I scroll?',
    option: 'headerLargeTitle',
    platform: 'ios',
    expected:
      'The title is large at the top of the list and shrinks into the bar as it scrolls',
    caveat:
      'The screen content must start with a scroll view, nothing wrapping it',
  },
  {
    id: 'header-views-shadow',
    route: ROUTE_NAME.HeaderViews,
    question: 'How do I remove the line under the header?',
    option: 'headerShadowVisible, headerLargeTitleShadowVisible',
    platform: 'all',
    expected:
      'The separator under the bar goes away, the large title one needs a large title',
    caveat:
      'A 1pt line is easy to miss, and on iOS 26 the system draws its own edge under the bar, so it may stay (not confirmed on a device)',
  },
  {
    id: 'header-views-title-style',
    route: ROUTE_NAME.HeaderViews,
    question: 'How do I change the font size or weight of the title?',
    option: 'headerTitleStyle, headerBackTitleStyle, headerLargeTitleStyle',
    platform: 'all',
    expected:
      'The title turns 20 bold, the back text 12, the large title amber and larger',
  },
  {
    id: 'header-views-direction',
    route: ROUTE_NAME.HeaderViews,
    question: 'How do I mirror the header for a right-to-left language?',
    option: 'headerDirection',
    platform: 'all',
    expected:
      'rtl moves the back button to the right edge and the right view to the left',
  },
  {
    id: 'header-views-glass',
    route: ROUTE_NAME.HeaderViews,
    question: 'How do I remove the glass pill behind header buttons?',
    option: 'headerLeftBackgroundVisible, headerRightBackgroundVisible',
    platform: 'ios26',
    expected:
      'With the switch off the custom view sits on the bare bar, not on a glass capsule',
  },
  {
    id: 'header-views-priority',
    route: ROUTE_NAME.HeaderViews,
    question: 'Which header items does the bar drop first when it is crowded?',
    option: 'headerLeftVisibilityPriority, headerRightVisibilityPriority',
    platform: 'ios27',
    expected:
      'When the items do not fit, the side set to low is given up first',
  },
];
