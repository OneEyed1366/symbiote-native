// React twins of `useEvent` and `useEventListener` of the `expo` package, for any emitter

import { useEffect, useRef, useState } from 'react';
import { bindEventListener } from '@symbiote-native/engine';
import type {
  IEventEmitterOf,
  IEventName,
  IEventPayload,
  IEventsMap,
} from '@symbiote-native/engine';

/** Calls the listener for each event, the latest one, and stops when the component unmounts */
export function useEventListener<
  TEventsMap extends IEventsMap,
  TName extends IEventName<TEventsMap>,
>(
  emitter: IEventEmitterOf<TEventsMap>,
  eventName: TName,
  listener: TEventsMap[TName],
): void {
  // Read at each event, so a listener that changes with every render is not a new subscription
  const latest = useRef(listener);
  latest.current = listener;

  useEffect(
    () => bindEventListener(emitter, eventName, () => latest.current),
    [emitter, eventName],
  );
}

/** The payload of the last event, `initialValue` (or `null`) until the first one */
export function useEvent<
  TEventsMap extends IEventsMap,
  TName extends IEventName<TEventsMap>,
>(
  emitter: IEventEmitterOf<TEventsMap>,
  eventName: TName,
  initialValue: IEventPayload<TEventsMap, TName>,
): IEventPayload<TEventsMap, TName>;
export function useEvent<
  TEventsMap extends IEventsMap,
  TName extends IEventName<TEventsMap>,
>(
  emitter: IEventEmitterOf<TEventsMap>,
  eventName: TName,
): IEventPayload<TEventsMap, TName> | null;
export function useEvent<
  TEventsMap extends IEventsMap,
  TName extends IEventName<TEventsMap>,
>(
  emitter: IEventEmitterOf<TEventsMap>,
  eventName: TName,
  initialValue: IEventPayload<TEventsMap, TName> | null = null,
): IEventPayload<TEventsMap, TName> | null {
  const [event, setEvent] = useState<IEventPayload<TEventsMap, TName> | null>(
    initialValue,
  );
  useEffect(
    () => bindEventListener(emitter, eventName, () => setEvent),
    [emitter, eventName],
  );
  return event;
}
