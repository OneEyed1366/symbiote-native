// Unit test for AnimatedMock (RN's AnimatedMock.js): when the host reports Platform.isDisableAnimations,
// react/animated swaps the live drivers for this mock: every animation jumps straight to its
// final value and fires the end callback SYNCHRONOUSLY (no frames). The Fabric slot is only here
// so setValue's flush path doesn't throw; no view is attached.
//
// No Negative group: every mocked factory (timing/spring/decay/sequence/parallel/stagger/loop/
// delay) accepts whatever config the live driver would and never validates it — the mock's whole
// point is to short-circuit straight to a resting value, so there is nothing here to reject.

import { describe, expect, it } from 'vitest';
import { AnimatedValue, AnimatedMock } from '@symbiote-native/engine';
import type { IEndResult } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

installFabric();

describe('AnimatedMock — Positive (every animation resolves synchronously)', () => {
  it('timing jumps to toValue synchronously and fires the callback exactly once', () => {
    const value = new AnimatedValue(0);
    const frames: number[] = [];
    value.addListener(({ value: v }) => frames.push(v));

    let endCount = 0;
    let landedValue = -1;
    let finishedInCallback = false;
    AnimatedMock.timing(value, { toValue: 1, duration: 10_000 }).start((result: IEndResult) => {
      endCount += 1;
      finishedInCallback = result.finished;
      // The callback runs INSIDE start(): value is already final here, no await.
      landedValue = value.__getValue();
    });

    expect(finishedInCallback).toBe(true);
    // No frame loop ran: even with a 10s duration the value is already at the target.
    expect(value.__getValue()).toBe(1);
    expect(landedValue).toBe(1);
    expect(endCount).toBe(1);
    expect(frames).toEqual([1]);
  });

  it('spring jumps to toValue synchronously', () => {
    const value = new AnimatedValue(0);
    let finished = false;
    AnimatedMock.spring(value, { toValue: 42, stiffness: 200, damping: 20 }).start(result => {
      finished = result.finished;
    });
    expect(value.__getValue()).toBe(42);
    expect(finished).toBe(true);
  });

  // why: decay has no toValue to land on (unlike timing/spring), so RN's mock returns the empty
  // animation — the value is left exactly where it was, and the callback never fires. Asserting
  // this distinguishes decay's mock from timing/spring's, which DO fire.
  it('decay is the empty animation: value untouched, callback never fires', () => {
    const value = new AnimatedValue(7);
    let called = false;
    AnimatedMock.decay(value, { velocity: 1 }).start(() => {
      called = true;
    });
    expect(value.__getValue()).toBe(7);
    expect(called).toBe(false);
  });

  it('sequence jumps its members synchronously, in order, and finishes', () => {
    const a = new AnimatedValue(0);
    const b = new AnimatedValue(0);
    let seqFinished = false;
    AnimatedMock.sequence([
      AnimatedMock.timing(a, { toValue: 1, duration: 5_000 }),
      AnimatedMock.timing(b, { toValue: 2, duration: 5_000 }),
    ]).start(result => {
      seqFinished = result.finished;
    });
    expect(a.__getValue()).toBe(1);
    expect(b.__getValue()).toBe(2);
    expect(seqFinished).toBe(true);
  });

  it('parallel jumps its members synchronously and finishes', () => {
    const c = new AnimatedValue(0);
    const d = new AnimatedValue(0);
    let parFinished = false;
    AnimatedMock.parallel([
      AnimatedMock.timing(c, { toValue: 3, duration: 5_000 }),
      AnimatedMock.timing(d, { toValue: 4, duration: 5_000 }),
    ]).start(result => {
      parFinished = result.finished;
    });
    expect(c.__getValue()).toBe(3);
    expect(d.__getValue()).toBe(4);
    expect(parFinished).toBe(true);
  });

  // why: stagger is built from sequence+delay under the mock — every mocked delay resolves
  // instantly (the empty animation, per RN), so a stagger's members must ALL land synchronously
  // rather than actually staggering in time.
  it('stagger jumps every member synchronously (mocked delay never actually waits)', () => {
    const a = new AnimatedValue(0);
    const b = new AnimatedValue(0);
    let staggerFinished = false;
    AnimatedMock.stagger(1_000, [
      AnimatedMock.timing(a, { toValue: 1, duration: 5_000 }),
      AnimatedMock.timing(b, { toValue: 2, duration: 5_000 }),
    ]).start(result => {
      staggerFinished = result.finished;
    });
    expect(a.__getValue()).toBe(1);
    expect(b.__getValue()).toBe(2);
    expect(staggerFinished).toBe(true);
  });

  // why: delay() alone (not composed into a stagger) is the empty animation — matching decay,
  // it never fires its callback, so a caller awaiting a mocked delay directly would hang, which
  // is the documented RN mock behavior (delay has nothing to "jump to").
  it('delay alone is the empty animation: no callback fires', () => {
    let called = false;
    AnimatedMock.delay(1_000).start(() => {
      called = true;
    });
    expect(called).toBe(false);
  });

  // why: loop is the empty animation under the mock (RN never loops synchronously — that would
  // hang forever) — it must resolve to a no-op rather than jumping the wrapped animation once.
  it('loop is the empty animation: the wrapped animation never actually runs', () => {
    const value = new AnimatedValue(0);
    let called = false;
    AnimatedMock.loop(AnimatedMock.timing(value, { toValue: 1, duration: 1_000 })).start(() => {
      called = true;
    });
    expect(value.__getValue()).toBe(0);
    expect(called).toBe(false);
  });

  // why: mockAnimationStart guards against a callback recursively triggering ANOTHER mocked
  // animation's callback (RN AnimatedMock.js:36-60) — without the guard, an app that starts a
  // new mocked animation from inside a completion callback could recurse unboundedly since every
  // mocked animation resolves synchronously, inside the SAME call stack.
  it('guards against a completion callback recursively re-entering another mocked animation callback', () => {
    const outer = new AnimatedValue(0);
    const inner = new AnimatedValue(0);
    let innerCallbackRan = false;

    AnimatedMock.timing(outer, { toValue: 1, duration: 100 }).start(() => {
      // Starting a second mocked animation FROM this callback must not let ITS callback run
      // (the recursive-callback guard drops it), even though inner's value still jumps.
      AnimatedMock.timing(inner, { toValue: 5, duration: 100 }).start(() => {
        innerCallbackRan = true;
      });
    });

    expect(inner.__getValue()).toBe(5); // the value still jumps...
    expect(innerCallbackRan).toBe(false); // ...but the nested callback was dropped
  });
});
