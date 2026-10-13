import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTiming } from 'react-native-reanimated/src/animation';
import { maybeBuild } from 'react-native-reanimated/src/animationBuilder';
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';
import { FlipOutXDown } from 'react-native-reanimated/src/layoutReanimation/defaultAnimations/Flip';
import { initializeLayoutAnimationsManager } from 'react-native-reanimated/src/layoutReanimation/animationsManager.native';
import { stubCancelAnimationFrame } from '../../test-support/cancel-animation-frame';

// What the native side hands an exiting 60 by 60 tile on a 390 by 844 screen
const TILE = 60;
const TAG = 4_001;
const FRAME_MS = 16;
const FRAMES = 90;
const PERSPECTIVE = 500;
const REALISTIC = {
  currentOriginX: 0,
  currentOriginY: 0,
  currentWidth: TILE,
  currentHeight: TILE,
  currentGlobalOriginX: 16,
  currentGlobalOriginY: 300,
  windowWidth: 390,
  windowHeight: 844,
};

type IProgress = Record<string, unknown>;

const progress: IProgress[] = [];
const ended: Array<[number, boolean]> = [];

function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbersIn);
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(numbersIn);
  }
  return [];
}

// The two exits of the demo screen that hid the buttons on a device
const exitPerspectiveScale = () => {
  'worklet';
  return {
    initialValues: { transform: [{ perspective: PERSPECTIVE }, { scale: 1 }] },
    animations: {
      transform: [{ perspective: PERSPECTIVE }, { scale: withTiming(0) }],
    },
  };
};

const exitTranslateByHeight = (values: { currentHeight: number }) => {
  'worklet';
  return {
    initialValues: { transform: [{ translateY: 0 }] },
    animations: {
      transform: [{ translateY: withTiming(values.currentHeight) }],
    },
  };
};

beforeEach(() => {
  progress.length = 0;
  ended.length = 0;
  stubCancelAnimationFrame();
  vi.useFakeTimers();
  vi.stubGlobal('_notifyAboutProgress', (_tag: number, props: IProgress) => {
    progress.push(structuredClone(props));
  });
  vi.stubGlobal('_notifyAboutEnd', (tag: number, shouldRemove: boolean) => {
    ended.push([tag, shouldRemove]);
  });
  vi.stubGlobal('_maybeFlushUIUpdatesQueue', () => undefined);
  vi.stubGlobal('_getAnimationTimestamp', () => performance.now());
  vi.stubGlobal('requestAnimationFrameFinalizer', (run: () => void) => {
    setTimeout(run, 0);
  });
  initializeLayoutAnimationsManager();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function runExit(
  config: Parameters<typeof maybeBuild>[0],
  values: Record<string, number | undefined> = REALISTIC,
): Promise<void> {
  const manager = globalThis.LayoutAnimationsManager;
  manager.start(TAG, LayoutAnimationType.EXITING, values, maybeBuild(config));
  await vi.advanceTimersByTimeAsync(FRAME_MS * FRAMES);
}

const exits = [
  ['FlipOutXDown', FlipOutXDown],
  ['perspective with scale', exitPerspectiveScale],
  ['translateY by the current height', exitTranslateByHeight],
] as const;

describe('an exit animation on the UI runtime, given the metrics of a real tile', () => {
  it.each(exits)(
    'reports only finite numbers on every frame of %s',
    async (_name, exit) => {
      await runExit(exit);

      expect(progress.length).toBeGreaterThan(0);
      expect(
        progress.flatMap(numbersIn).filter(n => !Number.isFinite(n)),
      ).toEqual([]);
    },
  );

  it.each(exits)(
    'ends %s and asks for the view to be removed',
    async (_name, exit) => {
      await runExit(exit);

      expect(ended).toEqual([[TAG, true]]);
    },
  );
});
