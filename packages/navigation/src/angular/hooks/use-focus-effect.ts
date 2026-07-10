// Thin `inject()`-based function: runs `effect` while the route is focused and runs its own
// returned cleanup on blur — exactly a plain effect's contract, just re-armed on every focus/blur
// pair instead of once on construction — mirrors @react-navigation's useFocusEffect and
// react/hooks/use-focus-effect.ts. Named `effect` for API parity with the React/Vue twins, NOT
// Angular's own `effect()` reactive primitive (this callback re-runs on focus/blur events, not on
// a signal dependency change) — callers should keep `effect` referentially stable across calls
// they don't intend to change (there is nothing here that re-subscribes automatically otherwise:
// this function is called once per component construction, matching an Angular hook's usual
// call-once-per-instance convention).

import { DestroyRef, inject } from '@angular/core';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS } from '../../core';
import { NavigationContextService } from '../navigation-context.service';

export type IFocusEffectCallback = () => (() => void) | void;

export function useFocusEffect(effect: IFocusEffectCallback): void {
  const context = inject(NavigationContextService, { optional: true });
  if (!context) {
    throw new Error(
      'useFocusEffect must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>',
    );
  }
  const destroyRef = inject(DestroyRef);

  let cleanup: ReturnType<IFocusEffectCallback>;

  const runEffect = (): void => {
    cleanup = effect();
  };
  const runCleanup = (): void => {
    cleanup?.();
    cleanup = undefined;
  };

  const unsubscribeFocus = context.emitter.addListener(NAVIGATION_EVENT_FOCUS, runEffect);
  const unsubscribeBlur = context.emitter.addListener(NAVIGATION_EVENT_BLUR, runCleanup);

  destroyRef.onDestroy(() => {
    unsubscribeFocus();
    unsubscribeBlur();
    runCleanup();
  });
}
