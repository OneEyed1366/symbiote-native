// Tracking: Animated.timing/spring with `toValue: anotherValue` makes a value CHASE a moving
// target. (A) public API wiring: timing(f, { toValue: t }).start() attaches a tracking node as a
// child of the target, and stop() tears it down. (B) mechanism: driving an AnimatedTracking with
// an instant fake driver, changing the target re-launches toward the new value, and stopping
// detaches it. The fake driver keeps the test off the real timeline.
//
// No Negative group: AnimatedTracking has no guard clause — it accepts any AnimatedValue/
// AnimatedNode pair and any driver factory; there is no invalid input this unit rejects.

import { beforeAll, describe, expect, it } from 'vitest';
import {
  AnimatedValue,
  AnimatedTracking,
  timing,
} from '@symbiote-native/engine';
import type { IAnimation, IEndCallback } from '@symbiote-native/engine';

// Part A starts a real TimingAnimation (to prove the public wiring), which needs a host rAF. We
// never advance a frame, so a no-op rAF that never fires is enough.
beforeAll(() => {
  Object.assign(globalThis, {
    requestAnimationFrame: (): number => 1,
    cancelAnimationFrame: (): void => {},
  });
});

// An instant driver: jump straight to the target and finish. Lets us assert the tracking wiring
// without advancing real frames.
function instantTo(target: number): IAnimation {
  return {
    start(
      _fromValue: number,
      onUpdate: (value: number) => void,
      onEnd: IEndCallback,
    ): void {
      onUpdate(target);
      onEnd({ finished: true });
    },
    stop(): void {},
  };
}

describe('Animated tracking — Positive (public API wiring)', () => {
  // why: `timing(follower, { toValue: target })` where target is itself an AnimatedNode must
  // build a tracking node and attach it as a child of the TARGET (not the follower) — that
  // subscription is what lets the follower learn about future target moves. stop() must tear
  // that subscription down, or the target would keep an orphaned tracking child forever.
  it('timing(toValue: node) attaches a tracking node onto the target, and stop() detaches it', () => {
    const follower = new AnimatedValue(0);
    const target = new AnimatedValue(10);

    const anim = timing(follower, { toValue: target, duration: 100 });
    anim.start();
    expect(target.__getChildren().length).toBeGreaterThanOrEqual(1);

    anim.stop();
    expect(target.__getChildren()).toHaveLength(0);
  });
});

describe('Animated tracking — Positive (mechanism)', () => {
  // why: track() immediately launches toward the target's CURRENT value (RN parity: the
  // tracking node subscribes in its constructor so it never misses the target's starting
  // point), then a target move re-launches automatically via the leaf update — this IS how a
  // spring "chases a moving target" (a gesture-driven pan) without the caller re-issuing
  // animate() on every frame.
  it('re-launches on target change and stops chasing on detach', () => {
    const follower = new AnimatedValue(0);
    const target = new AnimatedValue(10);

    const tracking = new AnimatedTracking(follower, target, toValue =>
      instantTo(toValue),
    );
    follower.track(tracking);
    // track() immediately launches toward the target's current value.
    expect(follower.__getValue()).toBe(10);

    // The target moves -> the follower chases it (re-launch via the leaf update).
    target.setValue(25);
    expect(follower.__getValue()).toBe(25);

    // Stopping the follower detaches the tracking; further target moves are ignored.
    follower.stopAnimation();
    target.setValue(99);
    expect(follower.__getValue()).toBe(25);
    expect(target.__getChildren()).toHaveLength(0);
  });

  // why: AnimatedValue.track() replaces WHATEVER is chasing right now — a caller re-tracking a
  // NEW target must stop the OLD tracking (detach from its old target) before subscribing to
  // the new one, or the follower would end up double-subscribed and chasing two targets at once.
  it('a second track() call detaches from the first target before chasing the new one', () => {
    const follower = new AnimatedValue(0);
    const firstTarget = new AnimatedValue(10);
    const secondTarget = new AnimatedValue(50);

    follower.track(
      new AnimatedTracking(follower, firstTarget, toValue =>
        instantTo(toValue),
      ),
    );
    expect(firstTarget.__getChildren()).toHaveLength(1);

    follower.track(
      new AnimatedTracking(follower, secondTarget, toValue =>
        instantTo(toValue),
      ),
    );
    expect(firstTarget.__getChildren()).toHaveLength(0); // detached from the old target
    expect(secondTarget.__getChildren()).toHaveLength(1);
    expect(follower.__getValue()).toBe(50); // chasing the NEW target's current value

    // The old target moving no longer affects the follower.
    firstTarget.setValue(999);
    expect(follower.__getValue()).toBe(50);
  });

  // why: the endCallback passed to AnimatedTracking is threaded through to EVERY re-launch (not
  // just the first), since `update()` re-calls `value.animate(createAnimation(...), endCallback)`
  // on each target move — a caller relying on "animation finished" to sync external state must
  // be notified on every chase leg, not only once.
  it('the tracking endCallback fires on every re-launch, not just the first', () => {
    const follower = new AnimatedValue(0);
    const target = new AnimatedValue(1);
    let endCount = 0;

    const tracking = new AnimatedTracking(
      follower,
      target,
      toValue => instantTo(toValue),
      () => {
        endCount += 1;
      },
    );
    follower.track(tracking);
    expect(endCount).toBe(1);

    target.setValue(2);
    expect(endCount).toBe(2);
  });
});
