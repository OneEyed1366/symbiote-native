import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const SHEET_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'sheet-detents',
    route: ROUTE_NAME.SheetDemo,
    question:
      'How do I make a bottom sheet with several heights, or one that fits its content?',
    option: 'sheetAllowedDetents',
    platform: 'all',
    expected:
      'Present the sheet and drag it: three stops at 30, 60 and 100 percent, one at half, or exactly as tall as its content',
    caveat:
      'Android keeps three values at most. medium, large and all are deprecated names, use a list',
  },
  {
    id: 'sheet-initial',
    route: ROUTE_NAME.SheetDemo,
    question: 'How do I open the sheet at a bigger height than the first stop?',
    option: 'sheetInitialDetentIndex',
    platform: 'all',
    expected:
      'The sheet opens at the chosen stop, last opens it at the largest one',
    caveat:
      'An index outside the list throws in development and falls back to 0 in a release build, the demo pulls it back to the last stop',
  },
  {
    id: 'sheet-undimmed',
    route: ROUTE_NAME.SheetDemo,
    question: 'How do I keep the screen behind the sheet tappable?',
    option: 'sheetLargestUndimmedDetentIndex',
    platform: 'all',
    expected:
      'With 0 the background counter above stays tappable while the sheet sits at its first stop, none dims it at every stop and a tap there dismisses',
    caveat:
      'last means no stop is dimmed, medium, large and all are deprecated names',
  },
  {
    id: 'sheet-grabber',
    route: ROUTE_NAME.SheetDemo,
    question: 'How do I show the grabber bar or round the sheet corners?',
    option: 'sheetGrabberVisible, sheetCornerRadius',
    platform: 'ios',
    expected:
      'The small bar appears at the top of the sheet and the corners follow the radius',
    caveat: 'Only a formSheet obeys them. system leaves the radius to iOS',
  },
  {
    id: 'sheet-expand-scroll',
    route: ROUTE_NAME.SheetDemo,
    question: 'Why does my sheet grow when I scroll its list?',
    option: 'sheetExpandsWhenScrolledToEdge',
    platform: 'ios',
    expected:
      'On, scrolling the list in a low sheet lifts it to the next stop, off keeps it where it is',
    caveat:
      'The scroll view must be the first child of the screen, with no SafeAreaView above it',
  },
  {
    id: 'sheet-content-style',
    route: ROUTE_NAME.SheetDemo,
    question:
      'How do I give the whole sheet a background colour, also under the home indicator?',
    option: 'contentStyle',
    platform: 'all',
    expected:
      'tint paints the sheet blue to its bottom edge, none leaves the screen colour',
  },
  {
    id: 'sheet-events',
    route: ROUTE_NAME.SheetDemo,
    question: 'How do I know which stop the sheet is at?',
    option: 'onSheetDetentChanged',
    platform: 'all',
    expected:
      'Drag the sheet: lines with the index and whether it settled appear in the sheet log',
    caveat:
      'isStable is false while the finger drags, true once the sheet came to rest',
  },
  {
    id: 'sheet-footer',
    route: ROUTE_NAME.SheetDemo,
    question: 'How do I pin a footer to the bottom of a sheet?',
    option: 'sheetFooter',
    platform: 'android',
    expected:
      'A bar stays at the bottom edge while the content scrolls above it',
    caveat:
      'The vendor marks it Android only and unstable. The option wraps its content in a ScreenFooter',
  },
  {
    id: 'sheet-android',
    route: ROUTE_NAME.SheetDemo,
    question:
      'How do I change the shadow of an Android sheet or let it go under the status bar?',
    option:
      'sheetElevation, sheetShouldOverflowTopInset, sheetDefaultResizeAnimationEnabled',
    platform: 'android',
    expected:
      'The top shadow follows the elevation, the sheet reaches the screen top when overflow is on, a fit-to-contents sheet resizes by itself',
    caveat: 'Elevation is read once, present a new sheet to see a change',
  },
  {
    id: 'sheet-stacking',
    route: ROUTE_NAME.SheetDemo,
    question: 'Can I open a sheet on top of another sheet?',
    option: 'push(route) from a formSheet',
    platform: 'all',
    expected:
      'Present another sheet from the open one: both stay, dismissing the top returns to the one below',
  },
];
