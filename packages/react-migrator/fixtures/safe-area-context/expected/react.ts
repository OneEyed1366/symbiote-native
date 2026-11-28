import { createContext, useContext } from 'react';
import type { Provider } from 'react';
import {
  SAFE_AREA_CONTEXT_NAME,
  requireSafeAreaFrame,
  selectSafeAreaInsets,
} from './core';
import type { ICornerAdaptedInsets, IEdgeInsets, IRect, IUseSafeAreaInsetsOptions } from './core';

// Bridge: one React context per key; `useValue` keeps the `use` prefix for `rules-of-hooks`
export function createContextBridge<TValue>(name: string): {
  Provider: Provider<TValue | undefined>;
  useValue: () => TValue | undefined;
} {
  const context = createContext<TValue | undefined>(undefined);
  context.displayName = name;
  return { Provider: context.Provider, useValue: () => useContext(context) };
}

export const SafeAreaInsetsContext = createContextBridge<IEdgeInsets | null>(
  SAFE_AREA_CONTEXT_NAME.insets,
);
export const SafeAreaFrameContext = createContextBridge<IRect | null>(SAFE_AREA_CONTEXT_NAME.frame);
export const SafeAreaCornerAdaptedInsetsContext = createContextBridge<ICornerAdaptedInsets | null>(
  SAFE_AREA_CONTEXT_NAME.cornerInsets,
);

export function useSafeAreaInsets(options?: IUseSafeAreaInsetsOptions): IEdgeInsets {
  return selectSafeAreaInsets(
    SafeAreaInsetsContext.useValue(),
    SafeAreaCornerAdaptedInsetsContext.useValue(),
    options?.cornerAdaptation,
  );
}

export function useSafeAreaFrame(): IRect {
  return requireSafeAreaFrame(SafeAreaFrameContext.useValue());
}
