// RN's `usePressability`, over RN's own `Pressability` class, which `bootstrapHost` hands to the
// engine. RN's class expects its synthetic events, so each handler gets the event with `persist()`

import { useInsertionEffect, useRef } from 'react';
import {
  loadPressability,
  type IPressability,
  type IPressabilityHandlers,
  type ISymbioteEvent,
} from '@symbiote-native/engine';

export type { IPressabilityHandlers } from '@symbiote-native/engine';

type IRectOrSize =
  number | { top?: number; left?: number; bottom?: number; right?: number };
type IPressHandler = (event: ISymbioteEvent) => unknown;

// RN's `PressabilityConfig`
export type IPressabilityConfig = {
  cancelable?: boolean | null;
  disabled?: boolean | null;
  hitSlop?: IRectOrSize | null;
  pressRectOffset?: IRectOrSize | null;
  android_disableSound?: boolean | null;
  delayHoverIn?: number | null;
  delayHoverOut?: number | null;
  delayLongPress?: number | null;
  delayPressIn?: number | null;
  delayPressOut?: number | null;
  minPressDuration?: number | null;
  onBlur?: IPressHandler | null;
  onFocus?: IPressHandler | null;
  onHoverIn?: IPressHandler | null;
  onHoverOut?: IPressHandler | null;
  onLongPress?: IPressHandler | null;
  onPress?: IPressHandler | null;
  onPressIn?: IPressHandler | null;
  onPressMove?: IPressHandler | null;
  onPressOut?: IPressHandler | null;
  blockNativeResponder?: boolean | null;
};

// An event of ours answers everything RN's class reads, `persist` apart: nothing is pooled here
function withPersist(event: ISymbioteEvent): ISymbioteEvent {
  return Object.assign(Object.create(event), { persist: () => {} });
}

function persistingHandlers(
  handlers: IPressabilityHandlers,
): IPressabilityHandlers {
  return Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => [
      name,
      (event: ISymbioteEvent) => handler(withPersist(event)),
    ]),
  );
}

type IInstance = {
  pressability: IPressability;
  handlers: IPressabilityHandlers;
};

export function usePressability(
  config: IPressabilityConfig,
): IPressabilityHandlers;
export function usePressability(
  config: IPressabilityConfig | null | undefined,
): IPressabilityHandlers | null;
export function usePressability(
  config: IPressabilityConfig | null | undefined,
): IPressabilityHandlers | null {
  const ref = useRef<IInstance | null>(null);
  if (config != null && ref.current === null) {
    const Pressability = loadPressability();
    const pressability = new Pressability(config);
    ref.current = {
      pressability,
      handlers: persistingHandlers(pressability.getEventHandlers()),
    };
  }
  const instance = ref.current;

  // A no-op on the first mount, on an update it points `Pressability` at the new config
  useInsertionEffect(() => {
    if (config != null && instance !== null) {
      instance.pressability.configure(config);
    }
  }, [config, instance]);

  // On unmount only, not when `config` changes: pending timers and state go
  useInsertionEffect(() => {
    if (instance === null) return undefined;
    return () => instance.pressability.reset();
  }, [instance]);

  return instance === null ? null : instance.handlers;
}
