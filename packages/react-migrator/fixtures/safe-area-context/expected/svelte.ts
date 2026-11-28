import { getContext, setContext } from 'svelte';
import {
  SAFE_AREA_CONTEXT_NAME,
  requireProvider,
  requireSafeAreaFrame,
  selectSafeAreaInsets,
} from './core';
import type { ICornerAdaptedInsets, IEdgeInsets, IRect, IUseSafeAreaInsetsOptions } from './core';

type IBox<TValue> = { readonly current: TValue };

// Bridge: setContext/getContext under one key; a boxed getter, as a plain value would not update
export function createContextBridge<TValue>(name: string): {
  provide: (value: IBox<TValue>) => void;
  read: () => IBox<TValue> | undefined;
} {
  const key = Symbol(name);
  return {
    provide: (value) => {
      setContext(key, value);
    },
    read: () => getContext<IBox<TValue> | undefined>(key),
  };
}

export const SafeAreaInsetsContext = createContextBridge<IEdgeInsets | null>(
  SAFE_AREA_CONTEXT_NAME.insets,
);
export const SafeAreaFrameContext = createContextBridge<IRect | null>(SAFE_AREA_CONTEXT_NAME.frame);
export const SafeAreaCornerAdaptedInsetsContext = createContextBridge<ICornerAdaptedInsets | null>(
  SAFE_AREA_CONTEXT_NAME.cornerInsets,
);

export function useSafeAreaInsets(options?: IUseSafeAreaInsetsOptions): IBox<IEdgeInsets> {
  const regular = requireProvider(SafeAreaInsetsContext.read());
  const corner = SafeAreaCornerAdaptedInsetsContext.read();
  return {
    get current(): IEdgeInsets {
      return selectSafeAreaInsets(regular.current, corner?.current, options?.cornerAdaptation);
    },
  };
}

export function useSafeAreaFrame(): IBox<IRect> {
  const frame = requireProvider(SafeAreaFrameContext.read());
  return {
    get current(): IRect {
      return requireSafeAreaFrame(frame.current);
    },
  };
}
