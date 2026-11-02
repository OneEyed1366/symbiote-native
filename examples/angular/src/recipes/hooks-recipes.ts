import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const HOOKS_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'hooks-effect-once',
    route: ROUTE_NAME.HooksDemo,
    question: 'Why does my effect run once instead of on every visit?',
    option: 'useFocusEffect, not a mount effect',
    platform: 'all',
    expected:
      'Push Details and come back: the focus counter grows, the mount time stays the same',
    caveat: 'A pushed screen stays mounted, so only focus tells a visit',
  },
  {
    id: 'hooks-is-focused',
    route: ROUTE_NAME.HooksDemo,
    question: 'How do I know my screen is the visible one?',
    option: 'useIsFocused()',
    platform: 'all',
    expected: 'The value reads true here and false while Details is on top',
  },
  {
    id: 'hooks-navigation-state',
    route: ROUTE_NAME.HooksDemo,
    question: 'How do I read the whole route stack?',
    option: 'useNavigationState(state => ...)',
    platform: 'all',
    expected: 'Each push of this screen adds one line to the list below',
    caveat: 'Under a Tab or Drawer the hook stays on its first snapshot',
  },
  {
    id: 'hooks-route-params',
    route: ROUTE_NAME.HooksDemo,
    question: 'How do I pass and read route params without a cast?',
    option: 'push(name, params) and a guard on route.params',
    platform: 'all',
    expected: 'Details shows the value sent from here after the push',
  },
];
