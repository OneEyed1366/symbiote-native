import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const TABS_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'tabs-icon-badge',
    route: ROUTE_NAME.TabsDemo,
    question: 'How do I add an icon or a badge to a tab?',
    option: 'tabBarIcon, tabBarBadge',
    platform: 'all',
    expected:
      'Icons start on, each tab has its own glyph and none removes them, the badge sits on the Search tab as a number or as text',
    caveat:
      'tabBarIcon takes a name or a ready descriptor here, not a render callback',
  },
  {
    id: 'tabs-tint',
    route: ROUTE_NAME.TabsDemo,
    question: 'How do I change the colour of the active tab?',
    option: 'tabBarActiveTintColor, tabBarInactiveTintColor',
    platform: 'all',
    expected:
      'The selected tab takes the active colour, the others the inactive one',
  },
  {
    id: 'tabs-bar-style',
    route: ROUTE_NAME.TabsDemo,
    question: 'How do I give the tab bar its own background?',
    option: 'tabBarStyle, screenOptions',
    platform: 'all',
    expected:
      'The bar turns dark for all three tabs at once, the colours above also go through screenOptions of the Tab',
  },
  {
    id: 'tabs-label',
    route: ROUTE_NAME.TabsDemo,
    question: 'Why does my tab show a different name than my screen title?',
    option: 'tabBarLabel, title',
    platform: 'all',
    expected:
      'Each tab shows its tabBarLabel, the screen title does not rename the tab',
  },
  {
    id: 'tabs-state-reset',
    route: ROUTE_NAME.TabsDemo,
    question: 'Why does my tab screen lose its state when I switch tabs?',
    option: 'Tab mounts the focused screen only',
    platform: 'all',
    expected:
      'Tap the local counter, switch away and back: it is 0 again, the counter kept above the Tab survives',
    caveat:
      'Lift the state above the Tab or into a store, Stack keeps its screens mounted instead',
  },
  {
    id: 'tabs-jump',
    route: ROUTE_NAME.TabsDemo,
    question: 'How do I switch tabs from a button and pass data to the tab?',
    option: 'jumpTo(name, params), setParams(params, key), initialRouteName',
    platform: 'all',
    expected:
      'The button jumps to the chosen tab with a param the tab prints, initial tab remounts the bar on that tab',
    caveat: 'setParams on a tab needs the key of the route, unlike Stack',
  },
];
