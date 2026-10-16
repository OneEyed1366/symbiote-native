// Stands in for upstream's `updateLayoutAnimations` in a bundle run by the tester: a config the
// package hands native reaches the proxy compiled into the tester, and each call is kept to read
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';

import { configureEntering, configureExiting } from './harness';

export type ILayoutConfigCall = {
  viewTag: number;
  type: LayoutAnimationType;
  isCleared: boolean;
};

export const layoutConfigCalls: ILayoutConfigCall[] = [];

// Native hands the config back when the animation starts, which the tester cannot carry, so the
// bridge keeps it: an exit by its tag, an entering one in the order they were configured
const byTag = new Map<number, unknown>();
const enteringQueue: unknown[] = [];

export function configFor(tag: number, type: LayoutAnimationType): unknown {
  if (type === LayoutAnimationType.ENTERING) return enteringQueue.shift();
  return byTag.get(tag);
}

export function forgetLayoutConfigs(): void {
  byTag.clear();
  enteringQueue.length = 0;
  layoutConfigCalls.length = 0;
}

export function updateLayoutAnimations(
  viewTag: number,
  type: LayoutAnimationType,
  config?: unknown,
): void {
  layoutConfigCalls.push({ viewTag, type, isCleared: config === undefined });
  if (config === undefined) return;
  if (type === LayoutAnimationType.ENTERING) {
    enteringQueue.push(config);
    configureEntering(viewTag);
  }
  if (type === LayoutAnimationType.EXITING) {
    byTag.set(viewTag, config);
    configureExiting(viewTag);
  }
}
