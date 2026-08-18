// Mirrors @react-navigation's useFocusEffect: run `effect` when the screen gains focus, run its
// returned cleanup when it loses focus (and once more on teardown).
//
// `create*`: it owns two subscriptions and the effect's cleanup slot.
//
// React's version requires memoizing `effect` (useCallback), since a new identity re-subscribes it
// like any other useEffect dependency. That does not apply here: a Solid body runs once, so
// `effect` is read once and closed over directly - there is no dependency array to go stale.

import { onCleanup } from 'solid-js';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS } from '../../core';
import { requireNavigationScope } from '../navigation-context';

export function createFocusEffect(effect: () => (() => void) | void): void {
  const scope = requireNavigationScope('createFocusEffect');

  let cleanup: (() => void) | void;
  const runEffect = (): void => {
    cleanup = effect();
  };
  const runCleanup = (): void => {
    cleanup?.();
    cleanup = undefined;
  };

  const { emitter } = scope();
  const unsubscribeFocus = emitter.addListener(
    NAVIGATION_EVENT_FOCUS,
    runEffect,
  );
  const unsubscribeBlur = emitter.addListener(
    NAVIGATION_EVENT_BLUR,
    runCleanup,
  );

  onCleanup(() => {
    unsubscribeFocus();
    unsubscribeBlur();
    runCleanup();
  });
}
