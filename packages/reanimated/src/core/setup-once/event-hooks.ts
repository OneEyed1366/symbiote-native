import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import type { UnknownRecord } from 'react-native-reanimated/src/common';
import type { DependencyList } from 'react-native-reanimated/src/hook/commonTypes';
import type {
  GeneralHandlers,
  UseHandlerContext,
} from 'react-native-reanimated/src/hook/useHandlerCommon';
import {
  createComposedEventHandler,
  createEventHandler,
  createHandlerState,
  isWorkletHandlers,
  type IEventHandler,
  type IEventHandlerInternal,
} from '../event-handlers';
import { observeHandlers } from '../hook-inputs';
import { observeScrollOffset } from '../scroll';
import { createUseAnimatedScrollHandler } from '../scroll-handler-hook';
import { createScrollOffsetHooks } from '../scroll-offset-hooks';
import { snapshotIfWorklet } from '../worklet-snapshot';
import type { ISetupOnceLifecycle } from './lifecycle';

// The hooks that hand worklet event handlers to a view, and the scroll offset made of them
export function createEventHooks(
  { onDispose, readAccessor }: ISetupOnceLifecycle,
  useSharedValue: (initialValue: number) => SharedValue<number>,
) {
  // Setup runs once, so the handler is built once over a snapshot and `rebuild` has nothing to tell
  function useEvent<
    Event extends object,
    Context extends Record<string, unknown> = never,
  >(
    handler: IEventHandler<Event, Context>,
    eventNames: readonly string[] = [],
    _rebuild = false,
  ): IEventHandlerInternal<Event> {
    return createEventHandler<Event>(snapshotIfWorklet(handler, readAccessor), [
      ...eventNames,
    ]);
  }

  function useHandler<Event extends object, Context extends UnknownRecord>(
    handlers: GeneralHandlers<Event, Context>,
    dependencies?: DependencyList,
  ): UseHandlerContext<Context> {
    const state = createHandlerState<Context>();
    const observation = observeHandlers(state, handlers, dependencies);
    if (isWorkletHandlers(handlers)) state.commit(handlers);
    return observation;
  }

  // Like `useEvent`, the result is the holder a prop of an animated view takes
  function useComposedEventHandler<Event extends object>(
    handlers: (IEventHandlerInternal<Event> | null)[],
  ): IEventHandlerInternal<Event> {
    const composed = createComposedEventHandler<Event>();
    const result = composed.compose(handlers);
    composed.commit();
    return result;
  }

  return {
    useEvent,
    useHandler,
    useComposedEventHandler,
    useAnimatedScrollHandler: createUseAnimatedScrollHandler(
      useHandler,
      useEvent,
    ),
    ...createScrollOffsetHooks({
      useSharedValue,
      useEvent,
      useStable: value => value,
      useObservation: (animatedRef, eventHandler, isObserving) => {
        if (animatedRef && isObserving) {
          onDispose(observeScrollOffset(animatedRef, eventHandler));
        }
      },
    }),
  };
}
