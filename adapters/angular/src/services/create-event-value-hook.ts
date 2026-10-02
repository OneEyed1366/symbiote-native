// Every `useXStatus`-style `injectX` (`injectAudioPlayerStatus`, ...) binds this to its own
// event name + initial-value getter instead of repeating the signal/effect wiring

import { effect, signal, type Signal } from '@angular/core';
import type { IEventValueSource } from '@symbiote-native/engine';

export function createEventValueHook<
  TSource extends IEventValueSource<TValue, TEvent>,
  TValue,
  TEvent extends string = string,
>(event: TEvent, getValue: (source: TSource) => TValue) {
  return function injectValue(getSource: () => TSource): Signal<TValue> {
    const value = signal(getValue(getSource()));

    effect(onCleanup => {
      const source = getSource();
      value.set(getValue(source));
      const subscription = source.addListener(event, next => value.set(next));
      onCleanup(() => subscription.remove());
    });

    return value.asReadonly();
  };
}
