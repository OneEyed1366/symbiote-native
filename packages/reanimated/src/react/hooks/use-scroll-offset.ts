import { useEffect, useRef } from 'react';
import { observeScrollOffset } from '../../core/scroll';
import { createScrollOffsetHooks } from '../../core/scroll-offset-hooks';
import { useEvent } from './use-event';
import { useSharedValue } from './use-shared-value';

export const { useObservedScrollOffset, useScrollOffset } =
  createScrollOffsetHooks({
    useSharedValue,
    useEvent,
    useStable: value => useRef(value).current,
    useObservation: (animatedRef, eventHandler, isObserving) => {
      useEffect(() => {
        if (!animatedRef || !isObserving) return undefined;
        return observeScrollOffset(animatedRef, eventHandler);
      }, [animatedRef, eventHandler, isObserving]);
    },
  });
