// Unit test for AnimatedInterpolation: a numeric output range stays number -> number, a
// value-with-units string range interpolates the number and re-appends the unit, a color range
// interpolates channel-wise and emits an rgba() string in RN's format (r,g,b rounded, alpha
// continuous), extrapolation controls the out-of-range branches, and the graph wiring
// (__attach/__detach/__makeNative/__getNativeConfig) matches every other graph node. Pure
// functions plus one graph node, so no Fabric slot.

import { describe, expect, it } from 'vitest';
import {
  AnimatedNode,
  AnimatedValue,
  checkValidRanges,
} from '@symbiote-native/engine';

describe('AnimatedNode.interpolate — the base-class implementation (Positive)', () => {
  it('works on a plain AnimatedNode subclass with no interpolate override of its own', () => {
    // A bare AnimatedNode subclass (not AnimatedValue, not any of the operator
    // classes): none of those per-class interpolate() overrides can be reached from
    // here, so a passing __getValue() proves the method lives on AnimatedNode itself.
    class BareValueNode extends AnimatedNode {
      constructor(private readonly value: number) {
        super();
      }

      override __getValue(): number {
        return this.value;
      }
    }

    const bare = new BareValueNode(0.5);
    const doubled = bare.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 2],
    });

    expect(doubled.__getValue()).toBe(1);
  });
});

describe('AnimatedInterpolation — Positive (non-numeric output ranges)', () => {
  it("interpolates a degrees string ('0deg' -> '360deg') at 0.5", () => {
    const deg = new AnimatedValue(0.5).interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });
    expect(deg.__getValue()).toBe('180deg');
  });

  it('keeps a fractional unit template shape at the endpoint', () => {
    const rad = new AnimatedValue(1).interpolate({
      inputRange: [0, 1],
      outputRange: ['1.5rad', '3rad'],
    });
    expect(rad.__getValue()).toBe('3rad');
  });

  it('interpolates a percent token in place at 0.25', () => {
    const percent = new AnimatedValue(0.25).interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    });
    expect(percent.__getValue()).toBe('25%');
  });

  it("interpolates a hex color range to mid-gray rgba() ('#000000' -> '#ffffff')", () => {
    const gray = new AnimatedValue(0.5).interpolate({
      inputRange: [0, 1],
      outputRange: ['#000000', '#ffffff'],
    });
    // (255 * 0.5) rounds to 128 per channel; alpha stays 1.
    expect(gray.__getValue()).toBe('rgba(128, 128, 128, 1)');
  });

  it('interpolates rgba() channels AND continuous alpha at 0.5', () => {
    const fade = new AnimatedValue(0.5).interpolate({
      inputRange: [0, 1],
      outputRange: ['rgba(0, 0, 0, 0)', 'rgba(100, 200, 40, 1)'],
    });
    expect(fade.__getValue()).toBe('rgba(50, 100, 20, 0.5)');
  });

  it('leaves the scalar number->number path untouched', () => {
    const scalar = new AnimatedValue(0.5).interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
    });
    expect(scalar.__getValue()).toBe(50);
  });

  // why: 'extend' (the default) keeps projecting past the range; a UI relying on this to
  // overshoot (e.g. a rubber-band effect) must not get silently clamped.
  it("extrapolate:'extend' (the default) keeps projecting past the input range", () => {
    const extended = new AnimatedValue(2).interpolate({
      inputRange: [0, 1],
      outputRange: [0, 10],
    });
    expect(extended.__getValue()).toBe(20);
  });

  // why: 'clamp' is the opt-in for a value that must never visually overshoot its bound (e.g. a
  // progress bar past 100%).
  it("extrapolate:'clamp' pins the output at the input range's boundary", () => {
    const clamped = new AnimatedValue(2).interpolate({
      inputRange: [0, 1],
      outputRange: [0, 10],
      extrapolate: 'clamp',
    });
    expect(clamped.__getValue()).toBe(10);
  });

  // why: 'identity' passes the raw INPUT straight through outside the range, distinct from
  // 'clamp' (which pins to the output boundary) — a caller relies on this to detect "am I past
  // the range" from the interpolated value itself.
  it("extrapolate:'identity' passes the raw input through unchanged past the range", () => {
    const identity = new AnimatedValue(5).interpolate({
      inputRange: [0, 1],
      outputRange: [0, 10],
      extrapolate: 'identity',
    });
    expect(identity.__getValue()).toBe(5);
  });

  // why: extrapolateLeft/extrapolateRight override the shared extrapolate independently per
  // side — a value clamped only going down (never overshoots below 0) but free to extend up.
  it('extrapolateLeft/extrapolateRight override extrapolate independently per side', () => {
    const asymmetric = new AnimatedValue(-1).interpolate({
      inputRange: [0, 1],
      outputRange: [0, 10],
      extrapolateLeft: 'clamp',
      extrapolateRight: 'extend',
    });
    expect(asymmetric.__getValue()).toBe(0); // clamped on the left

    const other = new AnimatedValue(2).interpolate({
      inputRange: [0, 1],
      outputRange: [0, 10],
      extrapolateLeft: 'clamp',
      extrapolateRight: 'extend',
    });
    expect(other.__getValue()).toBe(20); // still extending on the right
  });

  // why: __attach/__detach must wire the interpolation as a child of its PARENT node (not the
  // other way around) — this is what lets a setValue on the parent walk down into the
  // interpolation leaf during flushValue.
  it('__attach registers the interpolation as a child of its parent; __detach removes it', () => {
    const source = new AnimatedValue(0);
    const interpolation = source.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });
    const consumer = source.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });
    interpolation.__addChild(consumer);
    expect(source.__getChildren()).toContain(interpolation);

    interpolation.__removeChild(consumer);
    expect(source.__getChildren()).not.toContain(interpolation);
  });

  // why: __getNativeConfig must carry the resolved extrapolate sides (falling back through
  // extrapolate -> 'extend'), because native has no access to the JS-side default resolution —
  // it must receive the FINAL decision, not the shorthand.
  it('__getNativeConfig resolves extrapolateLeft/Right defaults for the native side', () => {
    const source = new AnimatedValue(0);
    const interpolation = source.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
    const config = interpolation.__getNativeConfig();
    expect(config).toMatchObject({
      type: 'interpolation',
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  });
});

describe('AnimatedInterpolation — Negative (the throw IS the contract)', () => {
  // why: an inputRange must express at least one segment — a single point has no direction to
  // interpolate along, so this is rejected at construction instead of producing an undefined
  // segment lookup at read time.
  it('checkValidRanges throws when inputRange has fewer than 2 elements', () => {
    expect(() => checkValidRanges([0], [0, 1])).toThrow(
      /inputRange must have at least 2 elements/,
    );
  });

  // why: findRange's binary-search-like scan assumes inputRange is sorted; a non-monotonic
  // range would silently pick the wrong segment instead of failing loudly.
  it('checkValidRanges throws when inputRange is not monotonically non-decreasing', () => {
    expect(() => checkValidRanges([1, 0], [0, 1])).toThrow(
      /monotonically non-decreasing/,
    );
  });

  it('checkValidRanges throws when inputRange and outputRange lengths differ', () => {
    expect(() => checkValidRanges([0, 1, 2], [0, 1])).toThrow(
      /inputRange \(3\) and outputRange \(2\) must have the same length/,
    );
  });

  // why: an unbounded ]-Infinity, +Infinity[ range has no way to normalize progress into [0,1] —
  // interpolateSegment's normalization step would divide by Infinity and produce NaN.
  it('checkValidRanges throws for an inputRange of exactly [-Infinity, Infinity]', () => {
    expect(() => checkValidRanges([-Infinity, Infinity], [0, 1])).toThrow(
      /inputRange cannot be \]-infinity;\+infinity\[/,
    );
  });

  it('checkValidRanges throws for an outputRange of exactly [-Infinity, Infinity]', () => {
    expect(() => checkValidRanges([0, 1], [-Infinity, Infinity])).toThrow(
      /outputRange cannot be \]-infinity;\+infinity\[/,
    );
  });

  // why: the constructor validates EAGERLY (per the class's own comment) so a malformed range
  // fails at construction, not on the first frame read — this proves the constructor actually
  // calls checkValidRanges rather than deferring it.
  it('the constructor throws immediately for a bad range, before any __getValue() read', () => {
    const source = new AnimatedValue(0);
    expect(() =>
      source.interpolate({ inputRange: [0], outputRange: [0, 1] }),
    ).toThrow();
  });

  // why: a string output range mixing a color entry with a non-color entry can't be
  // interpolated channel-wise (colors decompose to 4 fixed channels, templates to however many
  // numeric tokens they contain) — rejecting the mix avoids silently interpolating mismatched
  // slots.
  it('throws when the output range mixes a color entry with a non-color entry', () => {
    const source = new AnimatedValue(0.5);
    const mixed = source.interpolate({
      inputRange: [0, 1],
      outputRange: ['#000000', '10deg'],
    });
    expect(() => mixed.__getValue()).toThrow(
      /All elements of output range should either be a color or a string with numeric components/,
    );
  });

  // why: two non-color template strings with a DIFFERENT number of numeric tokens have no
  // shared per-token interpolation to build — '0deg' has 1 token, '0px 0px' has 2.
  it('throws when non-color output strings have different numbers of numeric components', () => {
    const source = new AnimatedValue(0.5);
    const mismatched = source.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '0px 0px'],
    });
    expect(() => mismatched.__getValue()).toThrow(
      /All elements of output range should have the same number of components/,
    );
  });

  // why: a string output value with no numeric token and no parseable color has nothing for the
  // per-token interpolation to drive — RN treats this as a config error, not a silent identity
  // template.
  it('throws when an output string has no numeric component and is not a color', () => {
    const source = new AnimatedValue(0.5);
    const noNumber = source.interpolate({
      inputRange: [0, 1],
      outputRange: ['none', 'auto'],
    });
    expect(() => noNumber.__getValue()).toThrow(
      /outputRange must contain color or value with numeric component/,
    );
  });

  // why: interpolation only makes sense over a NUMERIC parent value — chaining off a node whose
  // value is a composite (e.g. AnimatedColor's rgba() string) must fail loudly rather than
  // silently coerce the string.
  it('throws when the parent node resolves to a non-number (e.g. chained off a color-like node)', () => {
    // A bare AnimatedNode subclass whose __getValue() is a string, so this reaches the guard
    // through a real (if minimal) node — no `as` cast needed to fake a non-number parent.
    class StringValuedNode extends AnimatedNode {
      override __getValue(): string {
        return 'not-a-number';
      }
    }
    const stringParent = new StringValuedNode();
    const broken = stringParent.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });
    expect(() => broken.__getValue()).toThrow(
      'Cannot interpolate an input which is not a number',
    );
  });
});
