// What `useEvent` and `useEventListener` of the `expo` package do, without a framework: listen to
// a named event of any emitter (a native module, a shared object) and call the latest listener

import type { IEventSubscription } from './native-events';

export type IEmitterListener = (...args: never[]) => unknown;

/** The events of an emitter: a name to the listener it calls */
export type IEventsMap = Record<string, IEmitterListener>;

/** Structurally what the `EventEmitter` of `expo-modules-core` is, so no import of it here */
export type IEventEmitterOf<TEventsMap extends IEventsMap> = {
  addListener<TName extends keyof TEventsMap>(
    eventName: TName,
    listener: TEventsMap[TName],
  ): IEventSubscription;
};

export type IEventName<TEventsMap extends IEventsMap> = keyof TEventsMap &
  string;

/** The first argument of the listener of an event, which is the payload */
export type IEventPayload<
  TEventsMap extends IEventsMap,
  TName extends keyof TEventsMap,
> = Parameters<TEventsMap[TName]>[0];

// The typed emitters of the hooks all fit this, the binding itself does not need the types
type IUntypedEmitter = {
  addListener(
    eventName: string,
    listener: IEmitterListener,
  ): IEventSubscription;
};

/**
 * Subscribes once and reads the listener at each event, so a listener that changes with every
 * render needs no new subscription. Answers the function that removes it
 */
export function bindEventListener(
  emitter: IUntypedEmitter,
  eventName: string,
  getListener: () => IEmitterListener,
): () => void {
  const forward = (...args: unknown[]): unknown =>
    Reflect.apply(getListener(), undefined, args);
  const subscription = emitter.addListener(eventName, forward);
  return () => subscription.remove();
}
