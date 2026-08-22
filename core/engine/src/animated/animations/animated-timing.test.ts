// The JS-driven Animated drivers + composition: timing / spring drive an
// AnimatedValue over real rAF frames; stop() cancels mid-flight; sequence / parallel compose.
// A setTimeout polyfill stands in for the host's requestAnimationFrame so the drivers' frame
// loops run under Node. We observe the value through addListener. The Fabric slot is only here
// so AnimatedValue's flush path doesn't throw; no view is attached.
//
// No Negative group: TimingAnimation and the parallel/sequence composition functions accept
// whatever config they're given and never validate it — there is no invalid input this unit
// rejects.

import { beforeAll, describe, expect, it } from 'vitest';
import {
  AnimatedValue,
  Easing,
  parallel,
  sequence,
  spring,
  timing,
} from '@symbiote-native/engine';
import type { IEndResult } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

installFabric();

// Drivers read requestAnimationFrame / cancelAnimationFrame from the host at call time; Node has
// neither, so install a ~16ms setTimeout shim.
const frameTimers = new Map<number, ReturnType<typeof setTimeout>>();
let nextFrameId = 1;

beforeAll(() => {
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    Object.assign(globalThis, {
      requestAnimationFrame(callback: () => void): number {
        const id = nextFrameId++;
        const timer = setTimeout(() => {
          frameTimers.delete(id);
          callback();
        }, 16);
        frameTimers.set(id, timer);
        return id;
      },
      cancelAnimationFrame(id: number): void {
        const timer = frameTimers.get(id);
        if (timer !== undefined) {
          clearTimeout(timer);
          frameTimers.delete(id);
        }
      },
    });
  }
});

describe('Animated drivers over real rAF frames — Positive', () => {
  it('timing drives 0 -> 1, fires the callback once, and emits intermediate frames in (0,1)', async () => {
    const value = new AnimatedValue(0);
    const frames: number[] = [];
    value.addListener(({ value: v }) => frames.push(v));

    let endCount = 0;
    const result = await new Promise<IEndResult>(resolve => {
      timing(value, { toValue: 1, duration: 100, easing: Easing.linear }).start(
        r => {
          endCount += 1;
          resolve(r);
        },
      );
    });

    expect(result.finished).toBe(true);
    expect(endCount).toBe(1);
    expect(value.__getValue()).toBe(1);
    expect(frames.length).toBeGreaterThanOrEqual(2);
    for (const f of frames.slice(0, -1)) {
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThan(1);
    }
  });

  // why: duration:0 is the escape hatch for "jump immediately" (e.g. an animation config built
  // generically that sometimes gets a zero duration) — it must resolve on the SAME tick, never
  // schedule a frame that would delay a value the caller expects to be already final.
  it('duration:0 jumps straight to toValue synchronously, without scheduling a frame', () => {
    const value = new AnimatedValue(0);
    let finished: boolean | undefined;
    timing(value, { toValue: 1, duration: 0, easing: Easing.linear }).start(
      result => {
        finished = result.finished;
      },
    );
    // No `await` / timer tick anywhere above: if this passed, the whole thing ran synchronously.
    expect(value.__getValue()).toBe(1);
    expect(finished).toBe(true);
  });

  // why: `delay` defers the START of the frame loop — the value must stay untouched until the
  // delay elapses, proving the delay is honored rather than folded into the animation's own
  // progress curve.
  it('delay defers the start: the value is untouched until the delay elapses', async () => {
    const value = new AnimatedValue(0);
    const composite = timing(value, {
      toValue: 1,
      duration: 0,
      delay: 40,
      easing: Easing.linear,
    });

    let finished = false;
    const donePromise = new Promise<void>(resolve => {
      composite.start(() => {
        finished = true;
        resolve();
      });
    });

    // Still within the delay window: nothing has moved yet.
    expect(value.__getValue()).toBe(0);
    expect(finished).toBe(false);

    await donePromise;
    expect(value.__getValue()).toBe(1);
  });

  it('stop() mid-flight reports finished:false and a value below the target', async () => {
    const value = new AnimatedValue(0);
    const composite = timing(value, {
      toValue: 1,
      duration: 500,
      easing: Easing.linear,
    });

    const result = await new Promise<IEndResult>(resolve => {
      composite.start(resolve);
      setTimeout(() => composite.stop(), 50);
    });

    expect(result.finished).toBe(false);
    expect(value.__getValue()).toBeLessThan(1);
  });

  it('spring settles at its toValue and ends finished', async () => {
    const value = new AnimatedValue(0);
    const result = await new Promise<IEndResult>(resolve => {
      spring(value, { toValue: 1, stiffness: 200, damping: 20, mass: 1 }).start(
        resolve,
      );
    });

    expect(result.finished).toBe(true);
    expect(value.__getValue()).toBeCloseTo(1, 2);
  });

  it('sequence composes; all inner animations finish on their values', async () => {
    const a = new AnimatedValue(0);
    const b = new AnimatedValue(0);
    const result = await new Promise<IEndResult>(resolve => {
      sequence([
        timing(a, { toValue: 1, duration: 60, easing: Easing.linear }),
        timing(b, { toValue: 1, duration: 60, easing: Easing.linear }),
      ]).start(resolve);
    });

    expect(result.finished).toBe(true);
    expect(a.__getValue()).toBe(1);
    expect(b.__getValue()).toBe(1);
  });

  it('parallel composes; all inner animations finish on their values', async () => {
    const a = new AnimatedValue(0);
    const b = new AnimatedValue(0);
    const result = await new Promise<IEndResult>(resolve => {
      parallel([
        timing(a, { toValue: 1, duration: 80, easing: Easing.linear }),
        timing(b, { toValue: 1, duration: 80, easing: Easing.linear }),
      ]).start(resolve);
    });

    expect(result.finished).toBe(true);
    expect(a.__getValue()).toBe(1);
    expect(b.__getValue()).toBe(1);
  });

  // why: parallel's stopTogether:true default must propagate a stop to EVERY sibling — a
  // gesture-driven parallel group (e.g. scale + opacity) must not leave one half still animating
  // after the other was cancelled.
  it('parallel stopTogether (default) stops every sibling when one is stopped', async () => {
    const a = new AnimatedValue(0);
    const b = new AnimatedValue(0);
    const group = parallel([
      timing(a, { toValue: 1, duration: 500, easing: Easing.linear }),
      timing(b, { toValue: 1, duration: 500, easing: Easing.linear }),
    ]);

    const result = await new Promise<IEndResult>(resolve => {
      group.start(resolve);
      setTimeout(() => group.stop(), 30);
    });

    expect(result.finished).toBe(false);
    expect(a.__getValue()).toBeLessThan(1);
    expect(b.__getValue()).toBeLessThan(1);
  });
});
