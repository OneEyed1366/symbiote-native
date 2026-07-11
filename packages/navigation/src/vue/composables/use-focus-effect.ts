// Thin subscription wrapper: runs `effect` while the route is focused and runs its own returned
// cleanup on blur — mirrors @react-navigation's useFocusEffect. The Vue twin of
// react/hooks/use-focus-effect.ts: React's version documents that callers should memoize `effect`
// (React.useCallback) since a new identity re-subscribes it like any other useEffect dependency —
// that requirement doesn't carry over here. Vue's setup() runs once, so `effect` is read once by
// value at composable-call time and closed over directly by the onMounted/onUnmounted pair below;
// there is no dependency array to go stale.

import { onMounted, onUnmounted } from '@vue/runtime-core';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS } from '../../core';
import { requireNavigationScope } from '../navigation-context';

export function useFocusEffect(effect: () => (() => void) | void): void {
  const scope = requireNavigationScope('useFocusEffect');

  let cleanup: (() => void) | void;
  let unsubscribeFocus: (() => void) | undefined;
  let unsubscribeBlur: (() => void) | undefined;

  const runEffect = (): void => {
    cleanup = effect();
  };
  const runCleanup = (): void => {
    cleanup?.();
    cleanup = undefined;
  };

  onMounted(() => {
    const { emitter } = scope.value;
    unsubscribeFocus = emitter.addListener(NAVIGATION_EVENT_FOCUS, runEffect);
    unsubscribeBlur = emitter.addListener(NAVIGATION_EVENT_BLUR, runCleanup);
  });

  onUnmounted(() => {
    unsubscribeFocus?.();
    unsubscribeBlur?.();
    runCleanup();
  });
}
