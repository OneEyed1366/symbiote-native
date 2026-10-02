// Every `useXStatus`-style hook (`useAudioPlayerStatus`, `useAudioPlaylistStatus`, ...) binds
// this to its own event name + initial-value getter instead of repeating the subscribe wiring

import { useEffect, useState } from 'react';
import type { IEventValueSource } from '@symbiote-native/engine';

export function createEventValueHook<
  TSource extends IEventValueSource<TValue, TEvent>,
  TValue,
  TEvent extends string = string,
>(event: TEvent, getValue: (source: TSource) => TValue) {
  return function useEventValue(source: TSource): TValue {
    const [value, setValue] = useState(() => getValue(source));

    useEffect(() => {
      setValue(getValue(source));
      const subscription = source.addListener(event, setValue);
      return () => subscription.remove();
    }, [source]);

    return value;
  };
}
