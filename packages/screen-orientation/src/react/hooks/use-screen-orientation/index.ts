// React lifecycle wiring over the framework-agnostic core (core/screen-orientation.ts). Seeds
// the initial value with one-shot getOrientationAsync()/getOrientationLockAsync() calls before
// the first native event fires, mirroring packages/network's useNetworkState.
import { useEffect, useState } from 'react';
import {
  addOrientationChangeListener,
  getOrientationAsync,
  getOrientationLockAsync,
  Orientation,
  OrientationLock,
  type ScreenOrientationState,
} from '../../../core';

export function useScreenOrientation(): ScreenOrientationState {
  const [screenOrientation, setScreenOrientation] =
    useState<ScreenOrientationState>({
      orientation: Orientation.UNKNOWN,
      orientationLock: OrientationLock.UNKNOWN,
    });

  useEffect(() => {
    Promise.all([getOrientationAsync(), getOrientationLockAsync()]).then(
      ([orientation, orientationLock]) =>
        setScreenOrientation({ orientation, orientationLock }),
    );
    const subscription = addOrientationChangeListener(event =>
      setScreenOrientation({
        orientation: event.orientationInfo.orientation,
        orientationLock: event.orientationLock,
      }),
    );
    return () => subscription.remove();
  }, []);

  return screenOrientation;
}
