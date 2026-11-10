import { ROUTE_NAME } from '../routes';
import type { INavigationRecipe } from './recipe-types';

export const OVERLAY_RECIPES: readonly INavigationRecipe[] = [
  {
    id: 'overlays-toast',
    route: ROUTE_NAME.OverlayContainers,
    question: 'Why is my toast hidden behind a native modal?',
    option: 'FullWindowOverlay',
    platform: 'ios',
    expected:
      'Open the modal and ask for both toasts: the amber one from the screen below stays hidden, the mint overlay one shows above the modal',
    caveat:
      'Off iOS it is a plain view, a native modal there needs the toast inside its own tree',
  },
  {
    id: 'overlays-voiceover',
    route: ROUTE_NAME.OverlayContainers,
    question: 'How do I make VoiceOver treat the overlay as modal?',
    option: 'unstable_accessibilityContainerViewIsModal',
    platform: 'ios',
    expected:
      'With VoiceOver on, the overlay toast is read alone and the content below is skipped',
    caveat: 'The prop name carries unstable_ because upstream may change it',
  },
  {
    id: 'overlays-container',
    route: ROUTE_NAME.OverlayContainers,
    question: 'How do I switch screens without a navigator?',
    option: 'ScreenContainer, enabled, hasTwoStates',
    platform: 'all',
    expected:
      'The line names the native view the container becomes: a screen container, a navigation container with two states on iOS, or a plain view when disabled',
  },
];
