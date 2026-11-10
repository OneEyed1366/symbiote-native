import type { UnknownRecord } from 'react-native-reanimated/src/common';
import type {
  DependencyList,
  RNNativeScrollEvent,
} from 'react-native-reanimated/src/hook/commonTypes';
import type {
  ScrollHandler,
  ScrollHandlers,
} from 'react-native-reanimated/src/hook/useAnimatedScrollHandler';
import type {
  GeneralHandlers,
  UseHandlerContext,
} from 'react-native-reanimated/src/hook/useHandlerCommon';
import type { IEventHandler, IEventHandlerInternal } from './event-handlers';
import { scrollDispatcher, scrollEventNames } from './scroll';

// The two hooks an adapter has, which `useAnimatedScrollHandler` is made of
type IUseHandler = <Event extends object, Context extends UnknownRecord>(
  handlers: GeneralHandlers<Event, Context>,
  dependencies?: DependencyList,
) => UseHandlerContext<Context>;

export type IUseEvent = <
  Event extends object,
  Context extends Record<string, unknown> = never,
>(
  handler: IEventHandler<Event, Context>,
  eventNames?: readonly string[],
  rebuild?: boolean,
) => IEventHandlerInternal<Event>;

export function createUseAnimatedScrollHandler(
  useHandler: IUseHandler,
  useEvent: IUseEvent,
) {
  // Like `useEvent`, the result is the holder the `onScroll` prop of an animated view takes
  return function useAnimatedScrollHandler<
    Context extends Record<string, unknown>,
  >(
    handlers: ScrollHandler<Context> | ScrollHandlers<Context>,
    dependencies?: DependencyList,
  ): IEventHandlerInternal<RNNativeScrollEvent> {
    const scrollHandlers: ScrollHandlers<Context> =
      typeof handlers === 'function' ? { onScroll: handlers } : handlers;
    const { context, doDependenciesDiffer } = useHandler<
      RNNativeScrollEvent,
      Context
    >({ ...scrollHandlers }, dependencies);
    return useEvent<RNNativeScrollEvent, Context>(
      scrollDispatcher(scrollHandlers, context),
      scrollEventNames(scrollHandlers),
      doDependenciesDiffer,
    );
  };
}
