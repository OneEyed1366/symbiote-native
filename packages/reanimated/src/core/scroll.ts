import { logger } from 'react-native-reanimated/src/common';
import type {
  AnimatedRef,
  ReanimatedScrollEvent,
  RNNativeScrollEvent,
} from 'react-native-reanimated/src/hook/commonTypes';
import type { ScrollHandlers } from 'react-native-reanimated/src/hook/useAnimatedScrollHandler';
import type { IEventHandlerInternal } from './event-handlers';

const NOT_INITIALIZED_WARNING =
  'animatedRef is not initialized in useScrollOffset. Make sure to pass the animated ref to the scrollable component to get scroll offset updates.';

// Which handler answers which native event; `onScroll` is subscribed to whether given or not
const SCROLL_EVENTS = [
  ['onScroll', 'onScroll'],
  ['onBeginDrag', 'onScrollBeginDrag'],
  ['onEndDrag', 'onScrollEndDrag'],
  ['onMomentumBegin', 'onMomentumScrollBegin'],
  ['onMomentumEnd', 'onMomentumScrollEnd'],
] as const satisfies readonly [keyof ScrollHandlers<never>, string][];

export const NATIVE_SCROLL_EVENT_NAMES = SCROLL_EVENTS.map(
  ([, eventName]) => eventName,
);

export function scrollEventNames<Context extends Record<string, unknown>>(
  handlers: ScrollHandlers<Context>,
): string[] {
  return SCROLL_EVENTS.filter(
    ([name]) => name === 'onScroll' || handlers[name] !== undefined,
  ).map(([, eventName]) => eventName);
}

export function scrollDispatcher<Context extends Record<string, unknown>>(
  handlers: ScrollHandlers<Context>,
  context: Context,
): (event: ReanimatedScrollEvent) => void {
  return (event: ReanimatedScrollEvent) => {
    'worklet';
    const found = SCROLL_EVENTS.find(([, eventName]) =>
      event.eventName.endsWith(eventName),
    );
    if (found === undefined) return;
    handlers[found[0]]?.(event, context);
  };
}

// The handler listens to the tag of the ref for as long as the ref has one
export function observeScrollOffset(
  animatedRef: Pick<AnimatedRef, 'observe'>,
  eventHandler: IEventHandlerInternal<RNNativeScrollEvent>,
): () => void {
  return animatedRef.observe(tag => {
    if (!tag) {
      logger.warn(NOT_INITIALIZED_WARNING);
      return undefined;
    }
    eventHandler.workletEventHandler.registerForEvents(tag);
    return () => eventHandler.workletEventHandler.unregisterFromEvents(tag);
  });
}
