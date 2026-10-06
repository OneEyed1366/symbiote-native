// Vue twins of `useEvent` and `useEventListener` of the `expo` package, for any emitter

import { shallowRef, toValue, unref, watch } from '@vue/runtime-core';
import type { MaybeRef, MaybeRefOrGetter, ShallowRef } from '@vue/runtime-core';
import { bindEventListener } from '@symbiote-native/engine';
import type {
  IEventEmitterOf,
  IEventName,
  IEventPayload,
  IEventsMap,
} from '@symbiote-native/engine';

/** Calls the listener for each event, the latest one, and stops when the owner unmounts */
export function useEventListener<
  TEventsMap extends IEventsMap,
  TName extends IEventName<TEventsMap>,
>(
  emitter: MaybeRefOrGetter<IEventEmitterOf<TEventsMap>>,
  eventName: MaybeRefOrGetter<TName>,
  // A ref, not a getter: a function here is the listener itself
  listener: MaybeRef<TEventsMap[TName]>,
): void {
  watch(
    [() => toValue(emitter), () => toValue(eventName)],
    ([source, name], _previous, onCleanup) => {
      // The listener is read at each event, a new one is not a new subscription
      onCleanup(bindEventListener(source, name, () => unref(listener)));
    },
    { immediate: true },
  );
}

/** The payload of the last event, `initialValue` (or `null`) until the first one */
export function useEvent<
  TEventsMap extends IEventsMap,
  TName extends IEventName<TEventsMap>,
>(
  emitter: MaybeRefOrGetter<IEventEmitterOf<TEventsMap>>,
  eventName: MaybeRefOrGetter<TName>,
  initialValue: IEventPayload<TEventsMap, TName> | null = null,
): Readonly<ShallowRef<IEventPayload<TEventsMap, TName> | null>> {
  const event = shallowRef<IEventPayload<TEventsMap, TName> | null>(
    initialValue,
  );
  watch(
    [() => toValue(emitter), () => toValue(eventName)],
    ([source, name], _previous, onCleanup) => {
      onCleanup(
        bindEventListener(
          source,
          name,
          () => (next: IEventPayload<TEventsMap, TName>) => {
            event.value = next;
          },
        ),
      );
    },
    { immediate: true },
  );
  return event;
}
