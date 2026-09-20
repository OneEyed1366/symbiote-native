// AnimatedValue's own public API — setValue/setOffset/flattenOffset/extractOffset/animate/
// stopAnimation/resetAnimation — independent of Fabric entirely.
//
// SPLIT from animated-value.test.ts: these cases never touch a tree, a surface, or a host — no
// `installFabric()`/`installRecordingFabric()` needed at all, not even the recording host. The
// integration half (AnimatedValue driving a committed prop through `setNativeProps`'s TARGETED
// commit path) stays in the sibling file on `installFabric()` for the same confirmed reason
// `after-commit-lifecycle-targeted.test.ts` and `press-commit-race.test.ts` do — the recording
// host does not model per-surface root-tag identity, which that specific commit path needs.

import { describe, expect, it } from 'vitest';
import {
  AnimatedValue,
  type IAnimation,
  type IEndCallback,
} from '@symbiote-native/engine';

describe('AnimatedValue — Positive (own API, no Fabric slot)', () => {
  it('constructs from a plain number and reads it back via __getValue', () => {
    expect(new AnimatedValue(5).__getValue()).toBe(5);
  });

  // why: setOffset must compose ON TOP of the base value (used to compensate a gesture's
  // start point) without disturbing what setValue last wrote.
  it('setOffset adds on top of the base value without mutating it', () => {
    const v = new AnimatedValue(10);
    v.setOffset(3);
    expect(v.__getValue()).toBe(13);
    v.setValue(20);
    expect(v.__getValue()).toBe(23); // offset survives a later setValue
  });

  // why: flattenOffset must fold the offset into the base so the OUTPUT is unchanged, but a
  // later setOffset(0) really zeroes the composed value (proves the offset was actually folded
  // in, not just hidden).
  it('flattenOffset folds the offset into the base value, output unchanged', () => {
    const v = new AnimatedValue(10);
    v.setOffset(5);
    expect(v.__getValue()).toBe(15);
    v.flattenOffset();
    expect(v.__getValue()).toBe(15);
    v.setOffset(0);
    expect(v.__getValue()).toBe(15); // the 5 is now IN the base, not lost
  });

  // why: extractOffset is flattenOffset's mirror — move the base into the offset. Output is
  // still unchanged, but a later setValue only replaces the (now-zeroed) base, proving the old
  // base moved into the offset rather than being duplicated.
  it('extractOffset moves the base value into the offset, output unchanged', () => {
    const v = new AnimatedValue(10);
    v.extractOffset();
    expect(v.__getValue()).toBe(10);
    v.setValue(1);
    expect(v.__getValue()).toBe(11); // 1 (new base) + 10 (extracted offset)
  });

  // why: resetAnimation must restore the CONSTRUCTOR value, not merely undo the current
  // animation — a component remounting its animated value expects its original starting point.
  it('resetAnimation restores the value the instance was constructed with, not the last setValue', () => {
    const v = new AnimatedValue(7);
    v.setValue(99);
    v.resetAnimation();
    expect(v.__getValue()).toBe(7);
  });

  // why: stopAnimation's callback is the documented way to sync external state (e.g. a reducer)
  // to an animation's resting position; it must receive the CURRENT value, not the target.
  it('stopAnimation invokes its callback with the current value', () => {
    const v = new AnimatedValue(3);
    let callbackValue: number | undefined;
    v.stopAnimation(finalValue => {
      callbackValue = finalValue;
    });
    expect(callbackValue).toBe(3);
  });

  // A driver that never finishes on its own (stays "running" until replaced), so we can prove
  // animate() stops it when a second animation takes over.
  function blockingDriver(onStop: () => void): IAnimation {
    return {
      start(): void {
        /* never calls onEnd */
      },
      stop: onStop,
    };
  }

  // A driver that walks through `steps` synchronously and finishes.
  function steppingDriver(steps: number[]): IAnimation {
    return {
      start(_from, onUpdate, onEnd): void {
        for (const step of steps) onUpdate(step);
        onEnd({ finished: true });
      },
      stop(): void {},
    };
  }

  // why: "one value can drive many props in sync but is driven by one mechanism at a time" —
  // starting a second animation must stop the first, not run both concurrently.
  it('animate() stops whatever animation was previously driving the value', () => {
    const v = new AnimatedValue(0);
    let firstStopped = false;
    v.animate(blockingDriver(() => (firstStopped = true)));
    expect(firstStopped).toBe(false);

    const second: IEndCallback = () => {};
    v.animate(steppingDriver([2]), second);
    expect(firstStopped).toBe(true); // the blocking driver's stop() was called on replace
    expect(v.__getValue()).toBe(2);
  });

  // why: animate()'s onUpdate callback is how a driver walks the value through every
  // intermediate frame, and each step must flow through to listeners in order.
  it('animate() drives listeners through every intermediate step, then fires the end callback once', () => {
    const v = new AnimatedValue(0);
    const seen: number[] = [];
    v.addListener(({ value: n }) => seen.push(n));
    let endCount = 0;
    v.animate(steppingDriver([1, 2, 3]), () => {
      endCount += 1;
    });
    expect(seen).toEqual([1, 2, 3]);
    expect(endCount).toBe(1);
  });
});

describe('AnimatedValue — Negative (the throw IS the contract)', () => {
  // why: an AnimatedValue reached from JSON/native input rather than typed TS code can arrive
  // with a missing numeric field; the constructor rejects that loudly instead of silently
  // animating toward NaN, which would otherwise reach Fabric as a broken layout. `JSON.parse`
  // types its result `any`, so this reaches the guard without an `as` cast — the guard exists
  // precisely for this dynamic-input case, not for a TS-typed caller.
  it('the constructor throws when the value is not a number', () => {
    const missingField = JSON.parse('{}');
    expect(() => new AnimatedValue(missingField.value)).toThrow(
      'AnimatedValue: Attempting to set value to undefined',
    );
  });

  it('setValue throws under the same guard as the constructor', () => {
    const v = new AnimatedValue(0);
    const missingField = JSON.parse('{}');
    expect(() => v.setValue(missingField.value)).toThrow(
      'AnimatedValue: Attempting to set value to undefined',
    );
  });
});

describe('AnimatedValue — characterization [behavior captured, not confirmed]', () => {
  // QUESTION: resetAnimation(callback) delegates to stopAnimation(callback) BEFORE reassigning
  // this.value = startingValue, so the callback observes the PRE-reset value, not the value the
  // instance resets to. The class comment on stopAnimation promises the callback "useful for
  // syncing state to the animation's resting position" — for resetAnimation that reads as "the
  // value it reset TO", but the actual resting position the callback sees is the value from
  // right before the reset. This exactly mirrors RN's own AnimatedValue.js ordering, so it may
  // be an intentional upstream port rather than a bug — flagging because it is easy to misuse
  // (a caller syncing external state from this callback would sync to the WRONG value).
  it('resetAnimation(callback) [characterization] — callback observes the value before the reset, not after', () => {
    const v = new AnimatedValue(7);
    v.setValue(99);
    let callbackValue: number | undefined;
    v.resetAnimation(finalValue => {
      callbackValue = finalValue;
    });
    expect(callbackValue).toBe(99); // NOT 7, despite __getValue() being 7 immediately after
    expect(v.__getValue()).toBe(7);
  });
});
