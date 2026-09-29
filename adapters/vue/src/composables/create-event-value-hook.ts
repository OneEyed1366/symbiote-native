// Every `useXStatus`-style composable (`useAudioPlayerStatus`, `useAudioPlaylistStatus`, ...)
// binds this to its own event name + initial-value getter instead of repeating the watch wiring

import { shallowRef, watch, type ShallowRef } from '@vue/runtime-core';
import type { IEventValueSource } from '@symbiote-native/engine';

export function createEventValueHook<
  TSource extends IEventValueSource<TValue, TEvent>,
  TValue,
  TEvent extends string = string,
>(event: TEvent, getValue: (source: TSource) => TValue) {
  return function useEventValue(getSource: () => TSource): ShallowRef<TValue> {
    const value = shallowRef(getValue(getSource()));

    watch(
      getSource,
      (source, _previous, onCleanup) => {
        value.value = getValue(source);
        const subscription = source.addListener(event, next => {
          value.value = next;
        });
        onCleanup(() => subscription.remove());
      },
      { immediate: true },
    );

    return value;
  };
}
