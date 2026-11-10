import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const STACK_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'stack-presentation',
    route: ROUTE_NAME.StackTransitions,
    question:
      'What is the difference between modal, transparentModal and formSheet?',
    option: 'stackPresentation',
    platform: 'all',
    expected:
      'Push the probe with each value: a modal covers the screen, a transparent one shows the screen under it, a sheet stops short of the top',
    caveat:
      'Android falls back: modal and pageSheet act as push, containedModal as modal, formSheet is a bottom sheet. The two contained ones need a parent screen to open in, so this root stack does not push them',
  },
  {
    id: 'stack-animation',
    route: ROUTE_NAME.StackTransitions,
    question: 'How do I change the animation of one screen?',
    option: 'stackAnimation',
    platform: 'all',
    expected:
      'The probe enters and leaves with the chosen animation, popping it plays the same one backwards',
    caveat:
      'flip needs a modal and is iOS only. slide_from_right and the ios_ values are Android only, iOS keeps its default',
  },
  {
    id: 'stack-duration',
    route: ROUTE_NAME.StackTransitions,
    question: 'How do I make a screen transition slower or faster?',
    option: 'transitionDuration',
    platform: 'ios',
    expected:
      'The probe takes about the chosen milliseconds to arrive and to leave',
    caveat:
      'Only slide_from_bottom, fade_from_bottom, fade and simple_push obey it, default, flip, modals and sheets ignore it. The timed push here switches to fade on a plain push when needed',
  },
  {
    id: 'stack-replace-animation',
    route: ROUTE_NAME.StackTransitions,
    question: 'Why does replace() animate backwards, like a pop?',
    option: 'replaceAnimation',
    platform: 'all',
    expected:
      'Replace with pop and the new probe slides in as if the old one was dismissed, with push it slides in from the side like a push',
    caveat: 'The vendor does not name a platform for it, check both',
  },
  {
    id: 'stack-push',
    route: ROUTE_NAME.StackTransitions,
    question: 'push or replace, and where is navigate()?',
    option: 'push(name, params), replace(name, params)',
    platform: 'all',
    expected:
      'Push adds a probe and the depth grows, replace swaps the top probe and the depth stays',
    caveat:
      'There is no navigate(): push always adds, popTo goes back to a screen already there',
  },
  {
    id: 'stack-pop',
    route: ROUTE_NAME.StackTransitions,
    question: 'How do I go back more than one screen?',
    option: 'pop(count), popToTop()',
    platform: 'all',
    expected:
      'Pop 2 removes two probes at once, popToTop leaves only the first screen',
  },
  {
    id: 'stack-pop-to',
    route: ROUTE_NAME.StackTransitions,
    question:
      'How do I return to a specific earlier screen without a new copy?',
    option: 'popTo(key)',
    platform: 'all',
    expected:
      'Push three probes then popTo: you land on the screen the first probe was pushed from, the others are gone',
    caveat:
      'It takes a route key, not a name, a key that is not in the stack does nothing',
  },
  {
    id: 'stack-reset',
    route: ROUTE_NAME.StackTransitions,
    question: 'How do I rebuild the whole stack, for example after login?',
    option: 'reset(state)',
    platform: 'all',
    expected:
      'The stack becomes the menu plus one probe at depth 1, going back lands on the menu',
  },
  {
    id: 'stack-can-go-back',
    route: ROUTE_NAME.StackTransitions,
    question: 'How do I know whether there is a screen to go back to?',
    option: 'canGoBack()',
    platform: 'all',
    expected:
      'The readout says true while a screen is below this one and false on the first',
  },
];
