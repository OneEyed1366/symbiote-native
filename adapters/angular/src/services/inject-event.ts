// Angular twins of `useEvent` and `useEventListener` of the `expo` package, for any emitter

import { effect, signal, untracked } from '@angular/core';
import type { Signal } from '@angular/core';
import { bindEventListener } from '@symbiote-native/engine';
import type {
  IEventEmitterOf,
  IEventName,
  IEventPayload,
  IEventsMap,
} from '@symbiote-native/engine';

/** Calls the listener for each event, the latest one, and stops with the injection context */
export function injectEventListener<
  TEventsMap extends IEventsMap,
  TName extends IEventName<TEventsMap>,
>(
  emitter: () => IEventEmitterOf<TEventsMap>,
  eventName: () => TName,
  listener: () => TEventsMap[TName],
): void {
  effect(onCleanup => {
    const source = emitter();
    const name = eventName();
    // The listener is read at each event, a new one is not a new subscription
    onCleanup(bindEventListener(source, name, () => untracked(listener)));
  });
}

/** The payload of the last event, `initialValue` (or `null`) until the first one */
export function injectEvent<
  TEventsMap extends IEventsMap,
  TName extends IEventName<TEventsMap>,
>(
  emitter: () => IEventEmitterOf<TEventsMap>,
  eventName: () => TName,
  initialValue: IEventPayload<TEventsMap, TName> | null = null,
): Signal<IEventPayload<TEventsMap, TName> | null> {
  const event = signal<IEventPayload<TEventsMap, TName> | null>(initialValue);
  effect(onCleanup => {
    const source = emitter();
    const name = eventName();
    onCleanup(
      bindEventListener(
        source,
        name,
        () => (next: IEventPayload<TEventsMap, TName>) => event.set(next),
      ),
    );
  });
  return event.asReadonly();
}
