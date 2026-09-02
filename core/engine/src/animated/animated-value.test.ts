// Unit + integration test for AnimatedValue: the standard driving value. The
// "through commit" describe is an integration proof that a JS-driven value
// actually reaches a committed Fabric prop via the engine's clone-on-write path
// (setNativeProps -> completeRoot), which the pure-unit tests below cannot show
// on their own. The "Positive"/"Negative" describes below are unit tests of
// AnimatedValue's own public API (setValue/setOffset/flattenOffset/
// extractOffset/animate/stopAnimation/resetAnimation), independent of Fabric.

import { beforeAll, describe, expect, it } from 'vitest';
import {
  AnimatedNode,
  AnimatedValue,
  createElement,
  createSurface,
  getNativeTag,
  setNativeProps,
  setProp,
  type AnimatedInterpolation,
  type IAnimation,
  type IEndCallback,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const fabric = installFabric();

// The leaf that pushes a frame's value onto the view. In the adapter this is AnimatedProps wired
// to the host instance; here it is the minimal shape: pull the source value, setNativeProps it.
class PropLeaf extends AnimatedNode {
  constructor(
    private readonly source: AnimatedInterpolation,
    private readonly target: ISymbioteNode,
    private readonly key: string,
  ) {
    super();
  }
  update(): void {
    setNativeProps(this.target, { [this.key]: this.source.__getValue() });
  }
}

const ROOT_TAG = 41;

function appView(): IFakeNode {
  return fabric.appRoot().children[0];
}

const value = new AnimatedValue(0);
// Non-identity mapping so the assertion proves interpolation, not passthrough.
const width = value.interpolate({ inputRange: [0, 1], outputRange: [0, 100] });
const view = createElement('RCTView');

beforeAll(() => {
  const surface = createSurface(ROOT_TAG);
  setProp(view, 'width', width.__getValue()); // initial frame: 0
  surface.appendChild(view);
  surface.commit();

  // Wire the leaf into the graph: adding it to the interpolation attaches the interpolation to
  // the value, so a setValue flushes value -> width -> leaf.
  const leaf = new PropLeaf(width, view, 'width');
  width.__addChild(leaf);
});

describe('AnimatedValue through the clone-on-write commit (integration)', () => {
  it('commits the app view under a box-none AppContainer with the initial interpolated width', () => {
    expect(appView().viewName).toBe('RCTView');
    expect(appView().props.width).toBe(0);
  });

  it('exposes a native tag on the committed node for the native driver', () => {
    expect(getNativeTag(view)).toBeDefined();
  });

  // why: a JS value drive must recommit through the SAME node identity (clone-on-write), never
  // a brand-new tree, so the leaf's props land in exactly one completeRoot per setValue.
  // The awaits below are the coalesced setNativeProps flush: a drive queues its write and the
  // queue publishes at the microtask boundary (commit.ts, flushNativeProps). One await is enough —
  // the flush is queued before it.
  it('setValue(0.5) interpolates to width 50 in exactly one completeRoot', async () => {
    const commitsBefore = fabric.counts.completeRoot;
    value.setValue(0.5);
    await Promise.resolve();
    expect(appView().props.width).toBe(50);
    expect(fabric.counts.completeRoot).toBe(commitsBefore + 1);
  });

  it('setValue(1) interpolates to width 100', async () => {
    value.setValue(1);
    await Promise.resolve();
    expect(appView().props.width).toBe(100);
  });

  // why: a plain listener (e.g. an app reading scroll position) must see the RAW driving
  // value, while a bound prop leaf sees the value AFTER interpolation — the graph fans the
  // same setValue out to both representations independently.
  it('drives listeners with the raw value while the leaf gets the interpolated value', async () => {
    let observed = -1;
    value.addListener(({ value: v }) => {
      observed = v;
    });
    value.setValue(0.25);
    // The listener is synchronous and the committed prop is not — the two halves of this test sit
    // on opposite sides of the flush boundary deliberately.
    expect(observed).toBe(0.25);
    await Promise.resolve();
    expect(appView().props.width).toBe(25);
  });
});

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
