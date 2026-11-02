import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const PERSISTENCE_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'persist-save',
    route: ROUTE_NAME.StatePersistence,
    question: 'How do I save the navigation state to restore it later?',
    option: 'serializeNavigatorState, useNavigationState',
    platform: 'all',
    expected:
      'Push a few screens, Serialize prints the live stack as JSON with a key, a name and params per route',
    caveat:
      'Writing it to disk is up to the app, the snapshot here stays in memory until the app closes',
  },
  {
    id: 'persist-restore',
    route: ROUTE_NAME.StatePersistence,
    question: 'How do I restore the stack where the user left it?',
    option: 'deserializeNavigatorState, reset',
    platform: 'all',
    expected:
      'Restore makes the stack exactly the snapshot, depth changes at once and back walks the restored screens',
    caveat:
      'It moves you off this very screen when the snapshot has no copy of it',
  },
  {
    id: 'persist-invalid',
    route: ROUTE_NAME.StatePersistence,
    question: 'What happens when the saved state is corrupted?',
    option: 'deserializeNavigatorState throws',
    platform: 'all',
    expected:
      'Break the snapshot, then Restore: the error is printed and the stack stays as it was',
    caveat:
      'Wrap the call, a thrown error at startup leaves a blank screen. After an app update a saved stack can name a screen that is gone, so key the stored copy by version',
  },
  {
    id: 'persist-reset',
    route: ROUTE_NAME.StatePersistence,
    question:
      'How do I reset the navigation to a fresh stack, for example after sign in?',
    option: 'reset(state)',
    platform: 'all',
    expected:
      'Each preset replaces the whole stack at once: menu alone, menu with details, or the menu to a hub to a screen',
    caveat:
      'Every route needs its own key and the first route is the one the stack never pops',
  },
];
