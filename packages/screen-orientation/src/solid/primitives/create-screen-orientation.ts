// createScreenOrientation — the Solid twin of React's `useScreenOrientation` hook, Vue's
// composable and Svelte's rune, over the framework-agnostic core (core/screen-orientation.ts).
// Seeds with one-shot getOrientationAsync()/getOrientationLockAsync() calls before the first
// native event fires, mirroring packages/network's createNetworkState.
//
// `primitives/` and `create*`, never `hooks/`+`use*`: Solid's ecosystem calls a composable
// reactive function a PRIMITIVE and reserves `use*` for consuming something that already exists.
// Full rationale in adapters/solid/src/primitives/create-color-scheme.ts.
//
// Returns an ACCESSOR, never a snapshot: a Solid component body runs ONCE, so a returned object
// would pin the caller to the boot orientation.
//
// Outside a component or `createRoot` there is no owner for `onCleanup` — Solid warns and the
// native listener lives for the process. The accessor still tracks; only the teardown is lost.

import { createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  addOrientationChangeListener,
  getOrientationAsync,
  getOrientationLockAsync,
  Orientation,
  OrientationLock,
  type EventSubscription,
  type ScreenOrientationState,
} from '../../core';

export function createScreenOrientation(): Accessor<ScreenOrientationState> {
  const [screenOrientation, setScreenOrientation] =
    createSignal<ScreenOrientationState>({
      orientation: Orientation.UNKNOWN,
      orientationLock: OrientationLock.UNKNOWN,
    });

  Promise.all([getOrientationAsync(), getOrientationLockAsync()]).then(
    ([orientation, orientationLock]) => {
      setScreenOrientation({ orientation, orientationLock });
    },
  );

  // Subscribed from the primitive body, not from an effect: React/Vue/Svelte start listening a
  // tick after their seed runs, so a rotation landing in that window is lost. Both statements
  // here run in one synchronous tick and nothing can interleave.
  const subscription: EventSubscription = addOrientationChangeListener(
    event => {
      setScreenOrientation({
        orientation: event.orientationInfo.orientation,
        orientationLock: event.orientationLock,
      });
    },
  );

  onCleanup(() => {
    subscription.remove();
  });

  return screenOrientation;
}
