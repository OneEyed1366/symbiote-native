import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import { createAnimatedRef } from '../animated-ref';
import { reducedMotionAtStart } from '../reduced-motion';
import { createSharedValue } from '../shared-value';
import { createDeviceHooks } from './device-hooks';
import { createEventHooks } from './event-hooks';
import { createFrameHooks } from './frame-hooks';
import type { ISetupOnceLifecycle } from './lifecycle';
import { createMapperHooks } from './mapper-hooks';

export type { ISetupOnceLifecycle };

// Every hook of a framework whose setup runs once (Vue, Svelte, Solid, Angular): the body is the
// same, and a framework gives only how it disposes and how it follows what an updater reads
export function createSetupOnceHooks(lifecycle: ISetupOnceLifecycle) {
  // A function `initialValue` is called once on setup; a shared value must not hold functions
  function useSharedValue<Value>(
    initialValue: Value | (() => Value),
  ): SharedValue<Value> {
    const controller = createSharedValue(initialValue);
    lifecycle.onDispose(controller.dispose);
    return controller.shared;
  }

  return {
    useSharedValue,
    useAnimatedRef: createAnimatedRef,
    useReducedMotion: reducedMotionAtStart,
    ...createMapperHooks(lifecycle),
    ...createEventHooks(lifecycle, useSharedValue),
    ...createFrameHooks(lifecycle, useSharedValue),
    ...createDeviceHooks(lifecycle),
  };
}
