// Transition progress of one stack screen: three values the native `onTransitionProgress` drives
// A screen reads them to animate with the push or pop, as `useTransitionProgress` does upstream

import { createAnimatedValue, event } from '@symbiote-native/engine';
import type { AnimatedValue } from '@symbiote-native/engine';
import { isRecord } from './guards';

export type ITransitionProgress = {
  progress: AnimatedValue;
  closing: AnimatedValue;
  goingForward: AnimatedValue;
};

export function createTransitionProgress(): ITransitionProgress {
  return {
    progress: createAnimatedValue(0),
    closing: createAnimatedValue(0),
    goingForward: createAnimatedValue(0),
  };
}

// The guard every adapter's `useTransitionProgress` shares, only stack screens have the values
export function requireTransitionProgress(
  transition: ITransitionProgress | undefined,
): ITransitionProgress {
  if (transition === undefined) {
    throw new Error(
      'useTransitionProgress must be used within a screen rendered by <Stack>',
    );
  }
  return transition;
}

// Native drives the values on the UI thread, the listener only forwards the payload to the app
export function buildTransitionProgressEvent(
  transition: ITransitionProgress,
  listener: ((nativeEvent: Record<string, unknown>) => void) | undefined,
): (...args: unknown[]) => void {
  const { progress, closing, goingForward } = transition;
  return event([{ nativeEvent: { progress, closing, goingForward } }], {
    useNativeDriver: true,
    listener: (...args) => {
      const symbioteEvent = args[0];
      if (isRecord(symbioteEvent) && isRecord(symbioteEvent.nativeEvent)) {
        listener?.(symbioteEvent.nativeEvent);
      }
    },
  });
}

export type ITransitionProgressStore = {
  forRoute: (routeKey: string) => ITransitionProgress;
  keepOnly: (routeKeys: readonly string[]) => void;
};

// One store per stack instance, so a route keeps the same values across renders until it is popped
export function createTransitionProgressStore(): ITransitionProgressStore {
  const byRoute = new Map<string, ITransitionProgress>();
  return {
    forRoute(routeKey) {
      const existing = byRoute.get(routeKey);
      if (existing !== undefined) return existing;
      const created = createTransitionProgress();
      byRoute.set(routeKey, created);
      return created;
    },
    keepOnly(routeKeys) {
      for (const key of byRoute.keys()) {
        if (!routeKeys.includes(key)) byRoute.delete(key);
      }
    },
  };
}
