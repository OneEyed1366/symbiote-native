import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const NESTED_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'nested-parent',
    route: ROUTE_NAME.NestedNavigators,
    question:
      'How do I reach the parent navigator from a screen of a nested one?',
    option: 'useNavigation().getParent()',
    platform: 'all',
    expected:
      'The readout says the parent is a Stack, the button pops this screen off it',
    caveat: 'getParent walks exactly one hop up',
  },
  {
    id: 'nested-double-header',
    route: ROUTE_NAME.NestedNavigators,
    question: 'Why do I see two headers when I nest navigators?',
    option: 'headerShown: false on the parent screen',
    platform: 'all',
    expected:
      'With the parent header on, the Inner tab shows two bars, one above the other. Off leaves only the stack header',
  },
  {
    id: 'nested-container',
    route: ROUTE_NAME.NestedNavigators,
    question: 'How do I change the colour behind the screens of a stack?',
    option: 'nativeContainerStyle',
    platform: 'all',
    expected:
      'On the Inner tab push the detail: the backdrop of the stack takes the chosen colour where a screen paints nothing',
    caveat: 'Only backgroundColor is read',
  },
];
