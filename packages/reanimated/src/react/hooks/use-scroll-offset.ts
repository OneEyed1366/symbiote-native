import { useEffect, useRef } from 'react';
import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import type {
  ReanimatedScrollEvent,
  RNNativeScrollEvent,
} from 'react-native-reanimated/src/hook/commonTypes';
import type { IAnimatedRef } from '../../core/animated-ref';
import {
  NATIVE_SCROLL_EVENT_NAMES,
  observeScrollOffset,
} from '../../core/scroll';
import { useEvent } from './use-event';
import { useSharedValue } from './use-shared-value';

// Hooks run every render; `isObserving` lets a component that may have no offset skip the
// registration for scroll events without calling the hook conditionally
export function useObservedScrollOffset(
  animatedRef: Pick<IAnimatedRef, 'observe'> | null | undefined,
  providedOffset: SharedValue<number> | undefined,
  isObserving: boolean,
): SharedValue<number> {
  const internalOffset = useSharedValue(0);
  const offset = useRef(providedOffset ?? internalOffset).current;
  const eventHandler = useEvent<RNNativeScrollEvent>(
    (event: ReanimatedScrollEvent) => {
      'worklet';
      offset.value =
        event.contentOffset.x === 0
          ? event.contentOffset.y
          : event.contentOffset.x;
    },
    NATIVE_SCROLL_EVENT_NAMES,
  );
  useEffect(() => {
    if (!animatedRef || !isObserving) return undefined;
    return observeScrollOffset(animatedRef, eventHandler);
  }, [animatedRef, eventHandler, isObserving]);
  return offset;
}

export function useScrollOffset(
  animatedRef: Pick<IAnimatedRef, 'observe'> | null | undefined,
  providedOffset?: SharedValue<number>,
): SharedValue<number> {
  return useObservedScrollOffset(animatedRef, providedOffset, true);
}
