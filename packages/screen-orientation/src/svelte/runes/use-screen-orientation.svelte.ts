// Svelte lifecycle wiring over the framework-agnostic core (core/screen-orientation.ts). Seeds the
// initial value with one-shot getOrientationAsync()/getOrientationLockAsync() calls before the
// first native event fires, mirroring packages/network's useNetworkState.
//
// `.svelte.ts` (not `.ts`): runes ($state/$effect) are only usable in files with this extension
// outside an actual `.svelte` component. `runes/` is Svelte's own term for the lifecycle bucket,
// per CLAUDE.md's <adapter_src_follows_framework_idioms> — React calls it `hooks/`, Vue
// `composables/`. Returns a boxed getter object, NOT a bare `$state`: Svelte 5 reactivity is
// lexically scoped to the declaring module and does not survive being returned as a raw value
// from a plain function, so the caller reads `.current` exactly like unwrapping Vue's `Ref`
// via `.value`.
import {
  addOrientationChangeListener,
  getOrientationAsync,
  getOrientationLockAsync,
  Orientation,
  OrientationLock,
  type EventSubscription,
  type ScreenOrientationState,
} from '../../core';

export function useScreenOrientation(): { readonly current: ScreenOrientationState } {
  let screenOrientation = $state<ScreenOrientationState>({
    orientation: Orientation.UNKNOWN,
    orientationLock: OrientationLock.UNKNOWN,
  });

  $effect(() => {
    // Write-only touches of `screenOrientation` (never a read), so the effect has no dependency on
    // it and runs exactly once on mount, cleaning up exactly once on unmount — the twin of Vue's
    // onMounted/onUnmounted pair.
    Promise.all([getOrientationAsync(), getOrientationLockAsync()]).then(
      ([orientation, orientationLock]) => {
        screenOrientation = { orientation, orientationLock };
      },
    );
    const subscription: EventSubscription = addOrientationChangeListener(event => {
      screenOrientation = {
        orientation: event.orientationInfo.orientation,
        orientationLock: event.orientationLock,
      };
    });
    return () => subscription.remove();
  });

  return {
    get current(): ScreenOrientationState {
      return screenOrientation;
    },
  };
}
