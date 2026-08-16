// Unit test for AnimatedValueXY, which is not a driving node itself. It multiplexes two
// ordinary AnimatedValues (x, y), so this is pure JS, no native module and no Fabric slot.

import { describe, expect, it } from 'vitest';
import { AnimatedValue } from '@symbiote-native/engine';
import { AnimatedValueXY } from './value-xy';

describe('AnimatedValueXY — Positive', () => {
  // why: the {x, y} number form must build FRESH AnimatedValue children — every 2D gesture
  // value starts as its own independent pair, not sharing state with another instance.
  it('holds fresh AnimatedValue instances as its x/y children when constructed from numbers', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    expect(xy.x).toBeInstanceOf(AnimatedValue);
    expect(xy.y).toBeInstanceOf(AnimatedValue);
    expect(xy.x.__getValue()).toBe(1);
    expect(xy.y.__getValue()).toBe(2);
  });

  // why: the AnimatedValue-pair constructor form is how getLayout()/getTranslateTransform()
  // results (or any pre-built pair) get REUSED rather than re-wrapped — reusing the SAME
  // instances is what lets a caller keep driving values that another part of the graph already
  // depends on.
  it('reuses the SAME AnimatedValue instances when constructed from an AnimatedValue pair', () => {
    const x = new AnimatedValue(5);
    const y = new AnimatedValue(6);
    const xy = new AnimatedValueXY({ x, y });
    expect(xy.x).toBe(x);
    expect(xy.y).toBe(y);
  });

  it('wires getLayout() to the live x/y values (usable directly as {left, top} style)', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    const layout = xy.getLayout();
    expect(layout.left).toBe(xy.x);
    expect(layout.top).toBe(xy.y);
    expect(layout.left.__getValue()).toBe(1);
    expect(layout.top.__getValue()).toBe(2);
  });

  it('wires getTranslateTransform() to the live x/y values', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    const transform = xy.getTranslateTransform();
    expect(transform).toHaveLength(2);
    expect(transform[0].translateX).toBe(xy.x);
    expect(transform[1].translateY).toBe(xy.y);
  });

  it('setValue updates both axes and stays visible through getLayout', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    const layout = xy.getLayout();
    xy.setValue({ x: 10, y: 20 });
    expect(xy.__getValue()).toEqual({ x: 10, y: 20 });
    expect(layout.left.__getValue()).toBe(10);
    expect(layout.top.__getValue()).toBe(20);
  });

  // why: setOffset must fan out per-axis exactly like AnimatedValue.setOffset — a pan gesture
  // sets one XY offset to compensate its start point on both axes at once.
  it('setOffset applies independently to each axis on top of its base value', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    xy.setOffset({ x: 100, y: 200 });
    expect(xy.__getValue()).toEqual({ x: 101, y: 202 });
  });

  // why: flattenOffset/extractOffset must fold per axis independently — a pan gesture that ends
  // needs its offset folded into the base on BOTH axes before the next gesture starts fresh.
  it('flattenOffset folds each axis offset into its base, output unchanged', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    xy.setOffset({ x: 10, y: 20 });
    xy.flattenOffset();
    expect(xy.__getValue()).toEqual({ x: 11, y: 22 });
    xy.setOffset({ x: 0, y: 0 });
    expect(xy.__getValue()).toEqual({ x: 11, y: 22 }); // the fold really happened, not hidden
  });

  it('extractOffset moves each axis base into its offset, output unchanged', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    xy.extractOffset();
    expect(xy.__getValue()).toEqual({ x: 1, y: 2 });
    xy.setValue({ x: 0, y: 0 });
    expect(xy.__getValue()).toEqual({ x: 1, y: 2 }); // base replaced by 0, extracted offset remains
  });

  it('stopAnimation invokes its callback with the current combined 2D value', () => {
    const xy = new AnimatedValueXY({ x: 3, y: 4 });
    let observed: { x: number; y: number } | undefined;
    xy.stopAnimation(v => {
      observed = v;
    });
    expect(observed).toEqual({ x: 3, y: 4 });
  });

  // why: resetAnimation must restore BOTH axes to their construction-time values, matching
  // AnimatedValue.resetAnimation's per-axis contract.
  it('resetAnimation restores both axes to their constructed values', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    xy.setValue({ x: 50, y: 60 });
    let observed: { x: number; y: number } | undefined;
    xy.resetAnimation(v => {
      observed = v;
    });
    expect(xy.__getValue()).toEqual({ x: 1, y: 2 });
    expect(observed).toEqual({ x: 1, y: 2 });
  });

  // why: a listener on either axis must fire the SAME joint callback with the current combined
  // value — a consumer subscribes once, not once per axis.
  it('fires a combined listener with the fully-updated 2D value on either axis changing', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    const events: { x: number; y: number }[] = [];
    xy.addListener(value => {
      events.push({ x: value.x, y: value.y });
    });
    xy.setValue({ x: 3, y: 4 });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[events.length - 1]).toEqual({ x: 3, y: 4 });
  });

  it('removeListener detaches both axes for that joint id, later changes are silent', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    const events: { x: number; y: number }[] = [];
    const listenerId = xy.addListener(value => {
      events.push({ x: value.x, y: value.y });
    });
    xy.setValue({ x: 3, y: 4 });
    const countBefore = events.length;
    xy.removeListener(listenerId);
    xy.setValue({ x: 5, y: 6 });
    expect(events).toHaveLength(countBefore);
  });

  // why: removeAllListeners must clear EVERY joint registration, not just stop firing them — a
  // subsequent removeListener(id) on an already-cleared id must be a silent no-op (it is, per
  // the Map.get(id) === undefined guard), proving the joint bookkeeping was actually cleared.
  it('removeAllListeners detaches every joint listener from both axes', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    const events: unknown[] = [];
    const id = xy.addListener(v => events.push(v));
    xy.removeAllListeners();
    xy.setValue({ x: 9, y: 9 });
    expect(events).toHaveLength(0);
    expect(() => xy.removeListener(id)).not.toThrow();
  });
});

describe('AnimatedValueXY — Negative (the throw IS the contract)', () => {
  // why: the constructor accepts either an all-number pair or an all-AnimatedValue pair — a
  // MIXED pair (one axis a plain number, the other an AnimatedValue) is individually type-valid
  // per the declared `{x: number | AnimatedValue, y: number | AnimatedValue}` shape but is not a
  // coherent value to build a 2D node from, so the runtime guard rejects it explicitly instead
  // of silently coercing one axis. Reaching this needs no `as` cast: the mismatched pair is
  // valid per the declared type on its own.
  it('throws when x and y are a mismatched number/AnimatedValue pair', () => {
    expect(() => new AnimatedValueXY({ x: 1, y: new AnimatedValue(2) })).toThrow(
      'AnimatedValueXY must be initialized with an object of numbers or AnimatedValues.',
    );
  });

  it('throws the same way when the mismatch runs the other direction', () => {
    expect(() => new AnimatedValueXY({ x: new AnimatedValue(1), y: 2 })).toThrow(
      'AnimatedValueXY must be initialized with an object of numbers or AnimatedValues.',
    );
  });
});
