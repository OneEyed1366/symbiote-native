import { useExternalStore } from '../use-external-store';
import { createTransitionReadout } from './transition-readout';

// One readout for the app, so the screen shows the transitions that ran while it was away
export const transitionReadout = createTransitionReadout();

export function useTransitionReadout() {
  return useExternalStore(
    transitionReadout.subscribe,
    transitionReadout.snapshot,
  );
}
