import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const HEADER_OPTIONS_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'header-options-large-title',
    route: ROUTE_NAME.HeaderOptions,
    question: 'Why does my large title not collapse when I scroll?',
    option: 'headerLargeTitle, headerTranslucent',
    platform: 'ios',
    expected:
      'Scroll this screen: the large title shrinks into the bar, with the switch off the bar stays small',
    caveat:
      'The first child of the screen must be a scroll view with contentInsetAdjustmentBehavior automatic, a SafeAreaView above it stops the collapse',
  },
  {
    id: 'header-options-bar-items',
    route: ROUTE_NAME.HeaderOptions,
    question: 'How do I put buttons, a menu or a badge in the header?',
    option: 'headerLeftBarButtonItems, headerRightBarButtonItems',
    platform: 'ios',
    expected:
      'The header shows the chosen item, pressing it or a menu entry writes the last header action below',
    caveat:
      'Spacing adds a gap and a second button, a submenu nests a list inside the menu',
  },
  {
    id: 'header-options-placement',
    route: ROUTE_NAME.HeaderOptions,
    question:
      'Where does the search bar go on iOS 26, in the header or at the bottom?',
    option: 'headerSearchBarOptions.placement',
    platform: 'ios26',
    expected:
      'integrated puts the field in the header bar, integratedButton shows a button that opens it, stacked keeps it under the title',
    caveat:
      'automatic, inline and stacked exist before iOS 26, the integrated ones need it',
  },
  {
    id: 'header-options-search-behavior',
    route: ROUTE_NAME.HeaderOptions,
    question:
      'How do I hide the search bar while scrolling or dim the screen behind it?',
    option:
      'hideWhenScrolling, obscureBackground, hideNavigationBar, autoFocus, allowToolbarIntegration, autoCapitalize, cancelButtonText',
    platform: 'ios',
    expected:
      'Pull down to reveal the bar: it hides on scroll, dims the content, hides the navigation bar while focused, per switch',
    caveat:
      'autoFocus acts when the screen opens, leave and come back to see it. cancelButtonText is deprecated from iOS 26',
  },
  {
    id: 'header-options-search-colors',
    route: ROUTE_NAME.HeaderOptions,
    question:
      'How do I colour the search field and its text to match my theme?',
    option:
      'barTintColor, tintColor, textColor, hintTextColor, headerIconColor',
    platform: 'all',
    expected:
      'The field background, typed text, hint text, cursor and icon change together with the chosen theme',
    caveat:
      'hintTextColor and headerIconColor are Android twins, iOS ignores them',
  },
  {
    id: 'header-options-android',
    route: ROUTE_NAME.HeaderOptions,
    question: 'How do I change the keyboard of the Android search bar?',
    option: 'inputType, shouldShowHintSearchIcon, disableBackButtonOverride',
    platform: 'android',
    expected:
      'The keyboard follows the input type, the magnifier in the hint shows or hides, back closes the app instead of the search bar when the override is off',
  },
  {
    id: 'header-options-search-events',
    route: ROUTE_NAME.HeaderOptions,
    question:
      'How do I read what the user types and submits in the search bar?',
    option:
      'onChangeText, onSearchButtonPress, onFocus, onBlur, onCancelButtonPress, onOpen, onClose',
    platform: 'all',
    expected:
      'Type and press search: the last text, the submitted text and the last event update below',
    caveat: 'onOpen and onClose come from Android only',
  },
  {
    id: 'header-options-search-commands',
    route: ROUTE_NAME.HeaderOptions,
    question: 'How do I focus the search bar or fill it from code?',
    option:
      'headerSearchBarOptions.ref: focus, blur, setText, clearText, cancelSearch, toggleCancelButton',
    platform: 'all',
    expected:
      'Each button acts on the bar at once, the event line shows the focus and blur it caused',
  },
];
