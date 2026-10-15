// Drives a React screen with layout animations over the real engine and proxy
// Presses are touch events, frames come off a clock turned by hand, and the manager is upstream's
import './reanimated-web-shims';
import { advance, afterFrame, useSteppedFrames } from './reanimated-fake-time';
import type { ReactElement } from 'react';

import { mount, unmount } from '@symbiote-native/react';

import { initializeLayoutAnimationsManager } from 'react-native-reanimated/src/layoutReanimation/animationsManager.native';
import {
  dispatchEvent,
  endLayoutAnimation,
  findByTestId,
  mounted,
  progressLayoutAnimation,
  useLayoutAnimationsProxy,
  type IMountedView,
} from './harness';
import {
  configFor,
  forgetLayoutConfigs,
} from './reanimated-layout-config-bridge';

const ROOT_TAG = 1;
const FRAME_MS = 16;
const TOUCH = {
  touches: [{ identifier: 1, pageX: 20, pageY: 100, target: 0 }],
  changedTouches: [{ identifier: 1, pageX: 20, pageY: 100, target: 0 }],
  identifier: 1,
  pageX: 20,
  pageY: 100,
};

type IManager = {
  start: (...args: unknown[]) => void;
  stop: (tag: number) => void;
};

// The UI runtime globals the manager reads, answered by the proxy in the tester
Object.assign(globalThis, {
  _notifyAboutProgress: progressLayoutAnimation,
  _notifyAboutEnd: endLayoutAnimation,
  _maybeFlushUIUpdatesQueue: (): void => undefined,
  requestAnimationFrameFinalizer: afterFrame,
});
useSteppedFrames();
initializeLayoutAnimationsManager();
const manager: IManager = Reflect.get(globalThis, 'LayoutAnimationsManager');

export function settle(): void {
  advance(0);
  mounted();
}

export function startScreen(screen: ReactElement): void {
  forgetLayoutConfigs();
  useLayoutAnimationsProxy(true);
  // The proxy calls `start` from inside a pull and the first frame reports progress back into it,
  // so the start waits for the next turn of the clock, as the UI runtime's queue would make it
  Reflect.set(globalThis, 'LayoutAnimationsManager', {
    start: (tag: number, type: number, values: unknown) => {
      const config = configFor(tag, type);
      afterFrame(() => manager.start(tag, type, values, config));
    },
    stop: manager.stop,
  });
  mount(ROOT_TAG, screen);
  settle();
}

export function stopScreen(): void {
  unmount(ROOT_TAG);
  advance(0);
  useLayoutAnimationsProxy(false);
}

export function tap(testID: string): void {
  const found = findByTestId(testID);
  if (found === undefined) throw new Error(`${testID} is not on screen`);
  dispatchEvent(found.tag, 'touchStart', TOUCH);
  settle();
  dispatchEvent(found.tag, 'touchEnd', TOUCH);
  settle();
}

// A button the finger can no longer see is one that is gone, or one left faded
export function isOpaqueOnScreen(testID: string): boolean {
  const view = findByTestId(testID);
  return (
    view !== undefined &&
    (view.props.opacity === undefined || view.props.opacity === '1')
  );
}

export function countOnScreen(testID: string): number {
  const walk = (view: IMountedView): number =>
    (view.props.testID === testID ? 1 : 0) +
    view.children.reduce((sum, child) => sum + walk(child), 0);
  return walk(mounted());
}

// A display link: a frame of time, then the pull the platform makes at it
// The buttons are looked at on every frame, as a finger sees every frame and not the last one
export function frames(
  count: number,
  buttons: readonly string[],
  tile: string,
): number[] {
  const seen: number[] = [];
  for (let at = 0; at < count; at += 1) {
    advance(FRAME_MS);
    mounted();
    const lost = buttons.find(id => !isOpaqueOnScreen(id));
    if (lost !== undefined)
      throw new Error(`${lost} is gone or faded at frame ${at}`);
    seen.push(countOnScreen(tile));
  }
  return seen;
}
