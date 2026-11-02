import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const TRANSITION_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'transition-progress-hook',
    route: ROUTE_NAME.TransitionProgress,
    question: 'How do I animate something while a screen opens or closes?',
    option: 'useTransitionProgress()',
    platform: 'all',
    expected:
      'The card fades and grows while this screen opens, and follows your finger on a slow swipe back',
    caveat:
      'The values run on the native driver, so there is no JS work per frame',
  },
  {
    id: 'transition-flags',
    route: ROUTE_NAME.TransitionProgress,
    question: 'How do I tell a push from a pop inside the animation?',
    option: 'closing, goingForward',
    platform: 'all',
    expected:
      'Two lamps: closing lights while this screen leaves, goingForward while the stack pushes',
  },
  {
    id: 'transition-readout',
    route: ROUTE_NAME.TransitionProgress,
    question: 'Why does my transition callback fire so many times?',
    option: 'onTransitionProgress',
    platform: 'all',
    expected:
      'After Details and back, the readout shows the count of finished transitions and the ticks of the last one',
    caveat:
      'One event per frame, so the readout is written only when a transition ends',
  },
  {
    id: 'transition-header-height',
    route: ROUTE_NAME.TransitionProgress,
    question: 'How do I keep content out from under a translucent header?',
    option: 'onHeaderHeightChange',
    platform: 'all',
    expected:
      'The ruler is as tall as the header, and it grows when the large title is switched on',
    caveat:
      'A scroll view as the first child is inset for you, a plain view needs this number',
  },
];
