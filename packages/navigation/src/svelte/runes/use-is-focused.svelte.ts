// Mirrors @react-navigation's useIsFocused; Svelte twin of vue/composables/use-is-focused.ts.
// Starts `false` rather than guessing from stack position: the route's emitter only fires 'focus'
// once RNSScreen's native onAppear lands (stack) or the screen mounts focused (tabs/drawer) - a
// screen genuinely isn't focused at the instant it mounts, the same async gap real native
// transitions have.

import { untrack } from 'svelte';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS } from '../../core';
import { requireNavigationScope } from '../navigation-context';

export function useIsFocused(): { readonly current: boolean } {
  const scope = requireNavigationScope('useIsFocused');
  let isFocused = $state(false);

  // `untrack` keeps this effect's dependency set EMPTY, so it subscribes exactly once on mount
  // and cleans up exactly once on unmount - matching Vue's onMounted/onUnmounted pair. Without
  // it the effect would re-read `scope.current` and re-subscribe on every setParams (which
  // produces a new route object for the same key, and therefore the same emitter).
  $effect(() => {
    const { emitter } = untrack(() => scope.current);
    const unsubscribeFocus = emitter.addListener(NAVIGATION_EVENT_FOCUS, () => {
      isFocused = true;
    });
    const unsubscribeBlur = emitter.addListener(NAVIGATION_EVENT_BLUR, () => {
      isFocused = false;
    });
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  });

  return {
    get current(): boolean {
      return isFocused;
    },
  };
}
