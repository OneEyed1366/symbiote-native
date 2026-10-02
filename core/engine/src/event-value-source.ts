// A source that emits a named event carrying its own next value (`useAudioPlayerStatus`, ...)
// `TEvent` generic so a `SharedObject`'s own literal-keyed `addListener` structurally matches

import type { IEventSubscription } from './native-events';

export type IEventValueSource<TValue, TEvent extends string = string> = {
  addListener: (
    event: TEvent,
    listener: (value: TValue) => void,
  ) => IEventSubscription;
};
