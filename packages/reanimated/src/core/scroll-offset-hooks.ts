import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import type { RNNativeScrollEvent } from 'react-native-reanimated/src/hook/commonTypes';
import type { IAnimatedRef } from './animated-ref';
import type { IEventHandlerInternal } from './event-handlers';
import { NATIVE_SCROLL_EVENT_NAMES, scrollOffsetWriter } from './scroll';
import type { IUseEvent } from './scroll-handler-hook';

type IObservable = Pick<IAnimatedRef, 'observe'> | null | undefined;

// What differs between frameworks: a stable value, a shared value, and listening while mounted
type IScrollOffsetParts = {
  useSharedValue: (initialValue: number) => SharedValue<number>;
  useEvent: IUseEvent;
  useStable: <Value>(value: Value) => Value;
  useObservation: (
    animatedRef: IObservable,
    eventHandler: IEventHandlerInternal<RNNativeScrollEvent>,
    isObserving: boolean,
  ) => void;
};

export function createScrollOffsetHooks(parts: IScrollOffsetParts) {
  // `isObserving` lets a component that may have no offset skip the registration for scroll events
  // without the hook being called conditionally
  function useObservedScrollOffset(
    animatedRef: IObservable,
    providedOffset: SharedValue<number> | undefined,
    isObserving: boolean,
  ): SharedValue<number> {
    const internalOffset = parts.useSharedValue(0);
    const offset = parts.useStable(providedOffset ?? internalOffset);
    const eventHandler = parts.useEvent<RNNativeScrollEvent>(
      scrollOffsetWriter(offset),
      NATIVE_SCROLL_EVENT_NAMES,
    );
    parts.useObservation(animatedRef, eventHandler, isObserving);
    return offset;
  }

  function useScrollOffset(
    animatedRef: IObservable,
    providedOffset?: SharedValue<number>,
  ): SharedValue<number> {
    return useObservedScrollOffset(animatedRef, providedOffset, true);
  }

  return { useObservedScrollOffset, useScrollOffset };
}
