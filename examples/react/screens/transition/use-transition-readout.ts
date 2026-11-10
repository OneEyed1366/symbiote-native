import { useSyncExternalStore } from 'react';
import { createTransitionReadout } from './transition-readout';

// One readout for the app, so the screen shows the transitions that ran while it was away
export const transitionReadout = createTransitionReadout();

export function useTransitionReadout() {
  return useSyncExternalStore(
    transitionReadout.subscribe,
    transitionReadout.snapshot,
  );
}
