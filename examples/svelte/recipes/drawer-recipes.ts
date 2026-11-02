import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const DRAWER_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'drawer-type',
    route: ROUTE_NAME.DrawerDemo,
    question:
      'What is the difference between drawer type front, back, slide and permanent?',
    option: 'drawerType',
    platform: 'all',
    expected:
      'front slides over the screen under a dim, back is revealed behind it, slide moves both, permanent stays open as a sidebar',
    caveat: 'permanent never animates and takes no swipe',
  },
  {
    id: 'drawer-position',
    route: ROUTE_NAME.DrawerDemo,
    question: 'How do I open the drawer from the right?',
    option: 'drawerPosition',
    platform: 'all',
    expected:
      'Swipe from the chosen edge, the drawer and the buttons follow the side',
  },
  {
    id: 'drawer-width',
    route: ROUTE_NAME.DrawerDemo,
    question: 'How do I make the drawer wider or narrower?',
    option: 'drawerWidth',
    platform: 'all',
    expected: 'The panel is 200, 280 (library default) or 340 points wide',
  },
  {
    id: 'drawer-overlay',
    route: ROUTE_NAME.DrawerDemo,
    question: 'How do I change the dim behind the drawer?',
    option: 'overlayColor',
    platform: 'all',
    expected:
      'Default dims in grey, clear shows no dim, tint paints it blue; tapping it closes the drawer',
    caveat: 'Type back paints no dim at all, so the colour shows nothing there',
  },
  {
    id: 'drawer-swipe',
    route: ROUTE_NAME.DrawerDemo,
    question:
      'How do I turn off swiping to open the drawer, or make it easier?',
    option: 'swipeEnabled, swipeEdgeWidth, swipeMinDistance, swipeMinVelocity',
    platform: 'all',
    expected:
      'With swipe off only the buttons open it. A wider edge starts the swipe further from the side, a shorter distance or lower speed lets a small drag snap it open',
    caveat: 'Velocity is in points per millisecond, the library default is 0.5',
  },
  {
    id: 'drawer-content',
    route: ROUTE_NAME.DrawerDemo,
    question: 'How do I build my own drawer menu?',
    option:
      'renderDrawerContent, drawerLabel, jumpTo, openDrawer, closeDrawer, toggleDrawer',
    platform: 'all',
    expected:
      'The menu rows come from the screens by drawerLabel, a row calls jumpTo, the buttons open, close and toggle',
    caveat: 'The drawer ships no menu of its own',
  },
];
