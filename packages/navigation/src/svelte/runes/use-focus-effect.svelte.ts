// Mirrors @react-navigation's useFocusEffect; Svelte twin of vue/composables/use-focus-effect.ts.
// React's version requires memoizing `effect` (useCallback) since a new identity re-subscribes it
// like any other useEffect dependency. That doesn't apply here: a Svelte component's script runs
// once, so `effect` is read once at call time and closed over directly - there is no dependency
// array to go stale.

import { untrack } from 'svelte';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS } from '../../core';
import { requireNavigationScope } from '../navigation-context';

export function useFocusEffect(effect: () => (() => void) | void): void {
  const scope = requireNavigationScope('useFocusEffect');

  let cleanup: (() => void) | void;
  const runEffect = (): void => {
    cleanup = effect();
  };
  const runCleanup = (): void => {
    cleanup?.();
    cleanup = undefined;
  };

  // Empty dependency set (see use-is-focused.svelte.ts) so this subscribes once and tears down
  // once. The teardown also runs any still-pending cleanup, matching Vue's onUnmounted.
  $effect(() => {
    const { emitter } = untrack(() => scope.current);
    const unsubscribeFocus = emitter.addListener(
      NAVIGATION_EVENT_FOCUS,
      runEffect,
    );
    const unsubscribeBlur = emitter.addListener(
      NAVIGATION_EVENT_BLUR,
      runCleanup,
    );
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
      runCleanup();
    };
  });
}
