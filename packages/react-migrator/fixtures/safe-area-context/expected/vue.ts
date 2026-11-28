import { computed, inject, provide } from '@vue/runtime-core';
import type { ComputedRef, InjectionKey, ShallowRef } from '@vue/runtime-core';
import {
  SAFE_AREA_CONTEXT_NAME,
  requireProvider,
  requireSafeAreaFrame,
  selectSafeAreaInsets,
} from './core';
import type { ICornerAdaptedInsets, IEdgeInsets, IRect, IUseSafeAreaInsetsOptions } from './core';

// Bridge: provide/inject under one key; the value travels as a ShallowRef so readers see updates
export function createContextBridge<TValue>(name: string): {
  provide: (value: ShallowRef<TValue>) => void;
  read: () => ShallowRef<TValue> | undefined;
} {
  const key: InjectionKey<ShallowRef<TValue>> = Symbol(name);
  return {
    provide: (value) => provide(key, value),
    read: () => inject(key, undefined),
  };
}

export const SafeAreaInsetsContext = createContextBridge<IEdgeInsets | null>(
  SAFE_AREA_CONTEXT_NAME.insets,
);
export const SafeAreaFrameContext = createContextBridge<IRect | null>(SAFE_AREA_CONTEXT_NAME.frame);
export const SafeAreaCornerAdaptedInsetsContext = createContextBridge<ICornerAdaptedInsets | null>(
  SAFE_AREA_CONTEXT_NAME.cornerInsets,
);

export function useSafeAreaInsets(options?: IUseSafeAreaInsetsOptions): ComputedRef<IEdgeInsets> {
  const regular = requireProvider(SafeAreaInsetsContext.read());
  const corner = SafeAreaCornerAdaptedInsetsContext.read();
  return computed(() =>
    selectSafeAreaInsets(regular.value, corner?.value, options?.cornerAdaptation),
  );
}

export function useSafeAreaFrame(): ComputedRef<IRect> {
  const frame = requireProvider(SafeAreaFrameContext.read());
  return computed(() => requireSafeAreaFrame(frame.value));
}
