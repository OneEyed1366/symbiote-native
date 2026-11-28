import { InjectionToken, computed, inject } from '@angular/core';
import type { Provider, Signal } from '@angular/core';
import {
  SAFE_AREA_CONTEXT_NAME,
  requireProvider,
  requireSafeAreaFrame,
  selectSafeAreaInsets,
} from './core';
import type { ICornerAdaptedInsets, IEdgeInsets, IRect, IUseSafeAreaInsetsOptions } from './core';

// Bridge: one InjectionToken per key; a provider component lists `provide(...)` in its `providers`
export function createContextBridge<TValue>(name: string): {
  provide: (factory: () => Signal<TValue>) => Provider;
  read: () => Signal<TValue> | undefined;
} {
  const token = new InjectionToken<Signal<TValue>>(name);
  return {
    provide: (factory) => ({ provide: token, useFactory: factory }),
    read: () => inject(token, { optional: true }) ?? undefined,
  };
}

export const SafeAreaInsetsContext = createContextBridge<IEdgeInsets | null>(
  SAFE_AREA_CONTEXT_NAME.insets,
);
export const SafeAreaFrameContext = createContextBridge<IRect | null>(SAFE_AREA_CONTEXT_NAME.frame);
export const SafeAreaCornerAdaptedInsetsContext = createContextBridge<ICornerAdaptedInsets | null>(
  SAFE_AREA_CONTEXT_NAME.cornerInsets,
);

export function injectSafeAreaInsets(options?: IUseSafeAreaInsetsOptions): Signal<IEdgeInsets> {
  const regular = requireProvider(SafeAreaInsetsContext.read());
  const corner = SafeAreaCornerAdaptedInsetsContext.read();
  return computed(() => selectSafeAreaInsets(regular(), corner?.(), options?.cornerAdaptation));
}

export function injectSafeAreaFrame(): Signal<IRect> {
  const frame = requireProvider(SafeAreaFrameContext.read());
  return computed(() => requireSafeAreaFrame(frame()));
}
