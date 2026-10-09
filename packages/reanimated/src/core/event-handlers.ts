import type { WorkletFunction } from 'react-native-worklets';
import { isWorkletFunction, makeShareable } from 'react-native-worklets';
import type { ReanimatedEvent } from 'react-native-reanimated/src/hook/commonTypes';
import {
  areWorkletHandlersEqual,
  ensureWorkletHandlers,
} from 'react-native-reanimated/src/hook/useHandlerCommon';
import { WorkletEventHandler } from 'react-native-reanimated/src/WorkletEventHandler';

type IWorkletHandlers = Record<string, WorkletFunction>;

export function isWorkletHandlers(
  handlers: Record<string, unknown>,
): handlers is IWorkletHandlers {
  return Object.values(handlers).every(handler => isWorkletFunction(handler));
}

type IContextBag = Record<string, unknown>;

export type IHandlerObservation<Context extends IContextBag = IContextBag> = {
  // One shareable object the worklets of the handlers keep their state in
  context: Context;
  doDependenciesDiffer: boolean;
};

export type IHandlerState<Context extends IContextBag = IContextBag> = {
  observe: (handlers: Record<string, unknown>) => IHandlerObservation<Context>;
  // Called after the render that used the handlers was committed
  commit: (handlers: IWorkletHandlers) => void;
};

// The context starts empty and the worklets fill it in, so its type is the author's claim, as it is
// upstream
function isContextOf<Context extends IContextBag>(
  _empty: IContextBag,
): _empty is Context {
  return true;
}

function emptyContext<Context extends IContextBag>(): Context {
  const empty: IContextBag = makeShareable({});
  if (!isContextOf<Context>(empty)) throw new Error('unreachable');
  return empty;
}

export function createHandlerState<
  Context extends IContextBag = IContextBag,
>(): IHandlerState<Context> {
  let previous: IWorkletHandlers | undefined;
  let context: Context | undefined;
  return {
    observe: handlers => {
      if (__DEV__) ensureWorkletHandlers(handlers);
      return {
        get context() {
          context ??= emptyContext<Context>();
          return context;
        },
        doDependenciesDiffer: !(
          isWorkletHandlers(handlers) &&
          areWorkletHandlersEqual(handlers, previous)
        ),
      };
    },
    commit: handlers => {
      previous = handlers;
    },
  };
}

export type IEventHandlerInternal<Event extends object> = {
  workletEventHandler: WorkletEventHandler<Event>;
};

export type IEventHandlerController<Event extends object> =
  IEventHandlerInternal<Event> & {
    // The same handler again, taking the new worklet and names only when told to rebuild
    refresh: (
      handler: (event: ReanimatedEvent<Event>) => void,
      eventNames: string[],
      rebuild: boolean,
    ) => IEventHandlerInternal<Event>;
  };

export function createEventHandler<Event extends object>(
  handler: (event: ReanimatedEvent<Event>) => void,
  eventNames: string[] = [],
): IEventHandlerController<Event> {
  const workletEventHandler = new WorkletEventHandler<Event>(
    handler,
    eventNames,
  );
  return {
    workletEventHandler,
    refresh: (next, names, rebuild) => {
      if (rebuild) workletEventHandler.updateEventHandler(next, names);
      return { workletEventHandler };
    },
  };
}

export type IComposedEventHandler<Event extends object> = {
  compose: (
    handlers: (IEventHandlerInternal<Event> | null)[],
  ) => IEventHandlerInternal<Event>;
  commit: () => void;
};

type IWorkletsByEvent<Event extends object> = Record<
  string,
  ((event: ReanimatedEvent<Event>) => void)[]
>;

// Every worklet grouped under the event it handles, plus the record the dependency check reads,
// keyed `<event><nth>` so two handlers of one event stay apart
function collectHandlers<Event extends object>(
  handlers: (IEventHandlerInternal<Event> | null)[],
): { worklets: IWorkletsByEvent<Event>; record: IWorkletHandlers } {
  const worklets: IWorkletsByEvent<Event> = {};
  const record: IWorkletHandlers = {};
  for (const handler of handlers) {
    if (handler === null) continue;
    const { eventNames, worklet } = handler.workletEventHandler;
    for (const name of eventNames) {
      worklets[name] ??= [];
      worklets[name].push(worklet);
      if (isWorkletFunction(worklet)) {
        record[name + worklets[name].length] = worklet;
      }
    }
  }
  return { worklets, record };
}

export function createComposedEventHandler<
  Event extends object = object,
>(): IComposedEventHandler<Event> {
  let event: IEventHandlerController<Event> | undefined;
  let observed: IWorkletHandlers = {};
  const state = createHandlerState();

  return {
    compose: handlers => {
      const { worklets, record } = collectHandlers(handlers);
      observed = record;
      const { doDependenciesDiffer } = state.observe(record);
      const composedWorklet = (incoming: ReanimatedEvent<Event>) => {
        'worklet';
        worklets[incoming.eventName]?.forEach(worklet => worklet(incoming));
      };
      const eventNames = Object.keys(worklets);
      event ??= createEventHandler<Event>(composedWorklet, eventNames);
      return event.refresh(composedWorklet, eventNames, doDependenciesDiffer);
    },
    commit: () => state.commit(observed),
  };
}
