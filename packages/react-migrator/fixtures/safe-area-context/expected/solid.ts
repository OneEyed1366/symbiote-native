import { createContext, useContext } from 'solid-js';
import type { Accessor, ContextProviderComponent } from 'solid-js';
import {
  SAFE_AREA_CONTEXT_NAME,
  requireProvider,
  requireSafeAreaFrame,
  selectSafeAreaInsets,
} from './core';
import type { ICornerAdaptedInsets, IEdgeInsets, IRect, IUseSafeAreaInsetsOptions } from './core';

// Bridge: one Solid context per key; the value is an accessor, as a component body runs once
export function createContextBridge<TValue>(name: string): {
  Provider: ContextProviderComponent<Accessor<TValue> | undefined>;
  read: () => Accessor<TValue> | undefined;
} {
  const context = createContext<Accessor<TValue> | undefined>(undefined, { name });
  return { Provider: context.Provider, read: () => useContext(context) };
}

export const SafeAreaInsetsContext = createContextBridge<IEdgeInsets | null>(
  SAFE_AREA_CONTEXT_NAME.insets,
);
export const SafeAreaFrameContext = createContextBridge<IRect | null>(SAFE_AREA_CONTEXT_NAME.frame);
export const SafeAreaCornerAdaptedInsetsContext = createContextBridge<ICornerAdaptedInsets | null>(
  SAFE_AREA_CONTEXT_NAME.cornerInsets,
);

export function useSafeAreaInsets(options?: IUseSafeAreaInsetsOptions): Accessor<IEdgeInsets> {
  const regular = requireProvider(SafeAreaInsetsContext.read());
  const corner = SafeAreaCornerAdaptedInsetsContext.read();
  return () => selectSafeAreaInsets(regular(), corner?.(), options?.cornerAdaptation);
}

export function useSafeAreaFrame(): Accessor<IRect> {
  const frame = requireProvider(SafeAreaFrameContext.read());
  return () => requireSafeAreaFrame(frame());
}
