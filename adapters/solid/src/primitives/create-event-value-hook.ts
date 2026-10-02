// Every `useXStatus`-style primitive (`useAudioPlayerStatus`, `useAudioPlaylistStatus`, ...)
// binds this to its own event name + initial-value getter instead of repeating the effect wiring

import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import type { IEventValueSource } from '@symbiote-native/engine';

export function createEventValueHook<
  TSource extends IEventValueSource<TValue, TEvent>,
  TValue,
  TEvent extends string = string,
>(event: TEvent, getValue: (source: TSource) => TValue) {
  return function useEventValue(
    getSource: Accessor<TSource>,
  ): Accessor<TValue> {
    const [value, setValue] = createSignal(getValue(getSource()));

    createEffect(() => {
      const source = getSource();
      setValue(() => getValue(source));
      const subscription = source.addListener(event, next =>
        setValue(() => next),
      );
      onCleanup(() => subscription.remove());
    });

    return value;
  };
}
