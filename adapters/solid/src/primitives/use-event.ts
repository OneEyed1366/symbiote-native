// Solid twins of `useEvent` and `useEventListener` of the `expo` package, for any emitter

import { createEffect, createSignal, on, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { bindEventListener } from '@symbiote-native/engine';
import type {
  IEventEmitterOf,
  IEventName,
  IEventPayload,
  IEventsMap,
} from '@symbiote-native/engine';

/** Calls the listener for each event, the latest one, and stops when the owner is disposed */
export function useEventListener<
  TEventsMap extends IEventsMap,
  TName extends IEventName<TEventsMap>,
>(
  emitter: Accessor<IEventEmitterOf<TEventsMap>>,
  eventName: Accessor<TName>,
  listener: Accessor<TEventsMap[TName]>,
): void {
  createEffect(
    on([emitter, eventName], ([source, name]) => {
      // The listener is read at each event, a new one is not a new subscription
      onCleanup(bindEventListener(source, name, listener));
    }),
  );
}

/** The payload of the last event, `initialValue` (or `null`) until the first one */
export function useEvent<
  TEventsMap extends IEventsMap,
  TName extends IEventName<TEventsMap>,
>(
  emitter: Accessor<IEventEmitterOf<TEventsMap>>,
  eventName: Accessor<TName>,
  initialValue: IEventPayload<TEventsMap, TName> | null = null,
): Accessor<IEventPayload<TEventsMap, TName> | null> {
  const [event, setEvent] = createSignal<IEventPayload<
    TEventsMap,
    TName
  > | null>(initialValue);
  createEffect(
    on([emitter, eventName], ([source, name]) => {
      onCleanup(
        bindEventListener(
          source,
          name,
          () => (next: IEventPayload<TEventsMap, TName>) =>
            setEvent(() => next),
        ),
      );
    }),
  );
  return event;
}
