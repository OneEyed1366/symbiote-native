import type {
  DependencyList,
  RNNativeScrollEvent,
} from 'react-native-reanimated/src/hook/commonTypes';
import type {
  ScrollHandler,
  ScrollHandlers,
} from 'react-native-reanimated/src/hook/useAnimatedScrollHandler';
import type { IEventHandlerInternal } from '../../core/event-handlers';
import { scrollDispatcher, scrollEventNames } from '../../core/scroll';
import { useEvent } from './use-event';
import { useHandler } from './use-handler';

// Like `useEvent`, the result is the holder the `onScroll` prop of an animated view takes
export function useAnimatedScrollHandler<
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
}
