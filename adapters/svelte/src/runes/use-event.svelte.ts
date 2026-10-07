// Svelte twins of `useEvent` and `useEventListener` of the `expo` package, for any emitter,
// boxed getter shape of the other hooks

import { bindEventListener } from '@symbiote-native/engine';
import type {
  IEventEmitterOf,
  IEventName,
  IEventPayload,
  IEventsMap,
} from '@symbiote-native/engine';

/** Calls the listener for each event, the latest one, and stops when the owner is destroyed */
export function useEventListener<
  TEventsMap extends IEventsMap,
  TName extends IEventName<TEventsMap>,
>(
  getEmitter: () => IEventEmitterOf<TEventsMap>,
  getEventName: () => TName,
  getListener: () => TEventsMap[TName],
): void {
  $effect(() => {
    // The listener is read at each event, a new one is not a new subscription
    return bindEventListener(getEmitter(), getEventName(), getListener);
  });
}

/** The payload of the last event, `initialValue` (or `null`) until the first one */
export function useEvent<
  TEventsMap extends IEventsMap,
  TName extends IEventName<TEventsMap>,
>(
  getEmitter: () => IEventEmitterOf<TEventsMap>,
  getEventName: () => TName,
  initialValue: IEventPayload<TEventsMap, TName> | null = null,
): { readonly current: IEventPayload<TEventsMap, TName> | null } {
  let event = $state.raw<IEventPayload<TEventsMap, TName> | null>(initialValue);

  $effect(() =>
    bindEventListener(
      getEmitter(),
      getEventName(),
      () => (next: IEventPayload<TEventsMap, TName>) => {
        event = next;
      },
    ),
  );

  return {
    get current(): IEventPayload<TEventsMap, TName> | null {
      return event;
    },
  };
}
