// Svelte lifecycle wiring over the framework-agnostic core (core/screen-orientation.ts). Seeds the
// initial value with one-shot getOrientationAsync()/getOrientationLockAsync() calls before the
// first native event fires, mirroring packages/network's useNetworkState.
//
// `.svelte.ts` extension: runes ($state/$effect) only work there outside a `.svelte` component;
// `runes/` is Svelte's name for the lifecycle bucket (React's `hooks/`, Vue's `composables/`).
// Returns a boxed getter, not a bare `$state`: Svelte 5 reactivity is lexically scoped to the
// declaring module and doesn't survive being returned raw from a plain function, so the caller
// reads `.current` like unwrapping Vue's `Ref` via `.value`.
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
    // Write-only touches of `screenOrientation`, so the effect has no dependency on it and runs
    // once per mount - the twin of Vue's onMounted/onUnmounted pair.
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
