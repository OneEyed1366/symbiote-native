// Vue lifecycle wiring over the framework-agnostic core (core/screen-orientation.ts). Seeds the
// initial value with one-shot getOrientationAsync()/getOrientationLockAsync() calls before the
// first native event fires, mirroring packages/network's useNetworkState.

import { onMounted, onUnmounted, ref, type Ref } from '@vue/runtime-core';
import {
  addOrientationChangeListener,
  getOrientationAsync,
  getOrientationLockAsync,
  Orientation,
  OrientationLock,
  type EventSubscription,
  type ScreenOrientationState,
} from '../../../core';

export function useScreenOrientation(): Ref<ScreenOrientationState> {
  const screenOrientation = ref<ScreenOrientationState>({
    orientation: Orientation.UNKNOWN,
    orientationLock: OrientationLock.UNKNOWN,
  });
  let subscription: EventSubscription | undefined;

  onMounted(() => {
    Promise.all([getOrientationAsync(), getOrientationLockAsync()]).then(
      ([orientation, orientationLock]) => {
        screenOrientation.value = { orientation, orientationLock };
      },
    );
    subscription = addOrientationChangeListener(event => {
      screenOrientation.value = {
        orientation: event.orientationInfo.orientation,
        orientationLock: event.orientationLock,
      };
    });
  });

  onUnmounted(() => {
    subscription?.remove();
  });

  return screenOrientation;
}
