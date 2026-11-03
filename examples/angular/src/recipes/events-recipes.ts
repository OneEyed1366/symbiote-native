import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const EVENTS_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'events-focus-blur',
    route: ROUTE_NAME.Events,
    question: 'How do I run code when a screen gains or loses focus?',
    option: "navigation.addListener('focus' | 'blur')",
    platform: 'all',
    expected:
      'Push Details and come back: a blur line appears on the way out and a focus line on the way back',
  },
  {
    id: 'events-state',
    route: ROUTE_NAME.Events,
    question: 'How do I react to the navigator state changing?',
    option: "navigation.addListener('state')",
    platform: 'all',
    expected:
      'Every push, pop and setParams adds a state line with the route count',
  },
  {
    id: 'events-transition',
    route: ROUTE_NAME.Events,
    question: 'How do I follow a transition while it runs?',
    option: 'onTransitionProgress',
    platform: 'all',
    expected:
      'One progress line per transition, it shows the last value, the direction and how many ticks came',
    caveat:
      'Ticks fold into one line, a log line per frame would cost more than the animation',
  },
  {
    id: 'events-header',
    route: ROUTE_NAME.Events,
    question: 'When does the native header appear or go away?',
    option: 'onHeaderAttached, onHeaderDetached',
    platform: 'all',
    expected:
      'Opening the screen adds an attached line, leaving it and coming back shows the detached line from the way out',
  },
  {
    id: 'events-before-remove',
    route: ROUTE_NAME.Events,
    question: 'How do I run code just before a screen is removed?',
    option: "navigation.addListener('beforeRemove')",
    platform: 'all',
    expected: 'A line should appear when the screen is popped, none does today',
    caveat: 'The name is accepted but the event is not sent by any stack yet',
  },
];
