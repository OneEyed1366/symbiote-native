// A React context as Vue provide/inject: copied next to every port that declares a context
import { inject, provide, shallowRef } from '@vue/runtime-core';
import type { InjectionKey, Ref } from '@vue/runtime-core';

export type IContextBridge<TValue> = {
  provide: (value: Readonly<Ref<TValue>>) => void;
  read: () => Readonly<Ref<TValue>>;
};

// With no Provider above, a read gets the fallback, as `useContext` gets `createContext`'s default
export function createContextBridge<TValue>(name: string, fallback: TValue): IContextBridge<TValue> {
  const key: InjectionKey<Readonly<Ref<TValue>>> = Symbol(name);
  const fallbackRef = shallowRef(fallback);
  return {
    provide: (value) => provide(key, value),
    read: () => inject(key, fallbackRef),
  };
}
