// Unit test for the Animated arithmetic / operator nodes (add, subtract, multiply, divide, modulo,
// diffClamp). The JS path is the contract that MUST hold: arithmetic is exact, diffClamp
// accumulates the input's delta and clamps the running total to its band, modulo wraps
// Euclidean. The native path installs a fake NativeAnimatedTurboModule and asserts each node's
// __getNativeConfig type when the graph is made native.

import { beforeAll, describe, expect, it } from 'vitest';
import {
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
  AnimatedAddition,
  AnimatedSubtraction,
  AnimatedMultiplication,
  AnimatedDivision,
  AnimatedModulo,
  AnimatedDiffClamp,
  AnimatedColor,
  AnimatedNode,
  AnimatedValue,
} from '@symbiote-native/engine';

describe('Animated operators — Positive (JS path)', () => {
  it('add / subtract / multiply over two values', () => {
    const a = new AnimatedValue(3);
    const b = new AnimatedValue(4);
    expect(add(a, b).__getValue()).toBe(7);
    expect(subtract(a, b).__getValue()).toBe(-1);
    expect(multiply(a, b).__getValue()).toBe(12);
  });

  // why: every operator factory accepts a bare number as either operand (not just an
  // AnimatedNode) — a caller shouldn't have to wrap a constant in `new AnimatedValue(...)`
  // just to add it.
  it('wraps bare-number inputs in an AnimatedValue', () => {
    const v = new AnimatedValue(10);
    expect(add(v, 5).__getValue()).toBe(15);
    expect(add(2, 3).__getValue()).toBe(5);
  });

  // why: a raw JS divide-by-zero yields Infinity/NaN, which crashes Fabric layout — the operator
  // clamps to 0 instead of propagating the crash-prone value.
  it('divides, clamping divide-by-zero to 0 (avoids a Fabric crash)', () => {
    expect(divide(10, 4).__getValue()).toBe(2.5);
    expect(divide(1, 0).__getValue()).toBe(0);
  });

  // why: JS's own `%` keeps the dividend's sign (`-1 % 5 === -1`), which is the WRONG shape for
  // an angle/position wrap-around; Euclidean modulo always lands in [0, modulus).
  it('wraps modulo Euclidean so a negative input lands in [0, modulus)', () => {
    const v = new AnimatedValue(7);
    expect(modulo(v, 5).__getValue()).toBe(2);
    v.setValue(-1);
    expect(modulo(v, 5).__getValue()).toBe(4);
  });

  // why: diffClamp is the collapsing-header primitive — it must track the input's DELTA (not
  // its absolute value) so the output never snaps back to `min` just because the input crossed
  // below it earlier; only the ACCUMULATED delta is clamped to the band.
  it('diffClamp accumulates the frame-to-frame delta and clamps to [0, 10]', () => {
    const source = new AnimatedValue(0);
    const clamped = diffClamp(source, 0, 10);
    // pull once at the starting value to seed lastValue
    expect(clamped.__getValue()).toBe(0);

    const observed: number[] = [];
    for (const next of [5, 2, 20]) {
      source.setValue(next);
      observed.push(clamped.__getValue());
    }
    expect(observed).toEqual([5, 2, 10]);
  });
});

// Every binary operator (add/subtract/multiply/divide) shares the same
// __attach/__detach/__makeNative boilerplate around its own arithmetic; this is
// the regression net for extracting that boilerplate into a common base.
describe('Animated binary operators — shared attach/detach/makeNative boilerplate (Positive)', () => {
  const operators: ReadonlyArray<{
    name: string;
    create: (a: AnimatedNode, b: AnimatedNode) => AnimatedNode;
  }> = [
    { name: 'AnimatedAddition', create: (a, b) => new AnimatedAddition(a, b) },
    { name: 'AnimatedSubtraction', create: (a, b) => new AnimatedSubtraction(a, b) },
    { name: 'AnimatedMultiplication', create: (a, b) => new AnimatedMultiplication(a, b) },
    { name: 'AnimatedDivision', create: (a, b) => new AnimatedDivision(a, b) },
  ];

  it.each(operators)(
    'attaching the first downstream child on $name registers it as a child of BOTH operands, detaching the last removes it from both',
    ({ create }) => {
      const a = new AnimatedValue(1);
      const b = new AnimatedValue(2);
      const operator = create(a, b);
      const consumer = new AnimatedValue(0);

      expect(a.__getChildren()).not.toContain(operator);
      expect(b.__getChildren()).not.toContain(operator);

      // Operators attach lazily: only once something downstream starts listening
      // (its own first child) does it register itself as a child of its operands.
      operator.__addChild(consumer);
      expect(a.__getChildren()).toContain(operator);
      expect(b.__getChildren()).toContain(operator);

      operator.__removeChild(consumer);
      expect(a.__getChildren()).not.toContain(operator);
      expect(b.__getChildren()).not.toContain(operator);
    },
  );

  it.each(operators)('makeNative on $name marks BOTH operands native too', ({ create }) => {
    const a = new AnimatedValue(1);
    const b = new AnimatedValue(2);
    const operator = create(a, b);

    expect(a.__isNative()).toBe(false);
    expect(b.__isNative()).toBe(false);

    operator.__makeNative();

    expect(a.__isNative()).toBe(true);
    expect(b.__isNative()).toBe(true);
  });

  it.each(operators)(
    '$name.__getValue recomputes from the CURRENT operand values',
    ({ create }) => {
      const a = new AnimatedValue(1);
      const b = new AnimatedValue(2);
      const operator = create(a, b);
      const firstValue = operator.__getValue();

      // Not proportional to the starting values, so every operator (incl. divide)
      // is guaranteed a different result: a scaled pair would coincidentally
      // reproduce the same quotient.
      a.setValue(10);
      b.setValue(3);

      expect(operator.__getValue()).not.toBe(firstValue);
    },
  );
});

// AnimatedModulo and AnimatedDiffClamp take a SINGLE operand (unlike the binary ops above), so
// they wire attach/detach/makeNative against just `a` — this is their own regression net.
describe('Animated single-operand operators — attach/detach/makeNative (Positive)', () => {
  const singleOperandOperators: ReadonlyArray<{
    name: string;
    create: (a: AnimatedNode) => AnimatedNode;
  }> = [
    { name: 'AnimatedModulo', create: a => new AnimatedModulo(a, 5) },
    { name: 'AnimatedDiffClamp', create: a => new AnimatedDiffClamp(a, 0, 10) },
  ];

  it.each(singleOperandOperators)(
    'attaching the first downstream child on $name registers it as a child of `a`, detaching the last removes it',
    ({ create }) => {
      const a = new AnimatedValue(3);
      const operator = create(a);
      const consumer = new AnimatedValue(0);

      expect(a.__getChildren()).not.toContain(operator);
      operator.__addChild(consumer);
      expect(a.__getChildren()).toContain(operator);

      operator.__removeChild(consumer);
      expect(a.__getChildren()).not.toContain(operator);
    },
  );

  it.each(singleOperandOperators)('makeNative on $name marks `a` native too', ({ create }) => {
    const a = new AnimatedValue(3);
    const operator = create(a);
    expect(a.__isNative()).toBe(false);
    operator.__makeNative();
    expect(a.__isNative()).toBe(true);
  });
});

describe('Animated operators — Negative (the throw IS the contract)', () => {
  // why: every operator's arithmetic assumes both operands resolve to a NUMBER — an operand
  // that resolves to something else (e.g. AnimatedColor's rgba() string) must fail loudly at
  // read time rather than run NaN arithmetic through to a Fabric prop.
  it('add throws when an operand does not resolve to a number', () => {
    const nonNumeric = new AnimatedColor('#000000');
    const broken = add(nonNumeric, 1);
    expect(() => broken.__getValue()).toThrow(
      'Animated operator input did not resolve to a number',
    );
  });

  it('modulo throws when its operand does not resolve to a number', () => {
    const nonNumeric = new AnimatedColor('#000000');
    const broken = modulo(nonNumeric, 5);
    expect(() => broken.__getValue()).toThrow(
      'Animated operator input did not resolve to a number',
    );
  });
});

interface INativeCall {
  method: string;
  args: unknown[];
}

describe('Animated operators — native __getNativeConfig types (Positive)', () => {
  const nativeCalls: INativeCall[] = [];

  function record(method: string): (...args: unknown[]) => void {
    return (...args: unknown[]) => {
      nativeCalls.push({ method, args });
    };
  }

  function configTypeFor(node: AnimatedNode): unknown {
    node.__makeNative();
    const created = nativeCalls.find(
      call => call.method === 'createAnimatedNode' && call.args[0] === node.__getNativeTag(),
    );
    const config = created?.args[1];
    return typeof config === 'object' && config !== null && 'type' in config
      ? config.type
      : undefined;
  }

  beforeAll(() => {
    const fakeNativeAnimated = {
      createAnimatedNode(tag: number, config: unknown): void {
        nativeCalls.push({ method: 'createAnimatedNode', args: [tag, config] });
      },
      connectAnimatedNodes: record('connectAnimatedNodes'),
      disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
      connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
      disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
      restoreDefaultValues: record('restoreDefaultValues'),
      dropAnimatedNode: record('dropAnimatedNode'),
      startAnimatingNode: record('startAnimatingNode'),
      stopAnimation: record('stopAnimation'),
      setAnimatedNodeValue: record('setAnimatedNodeValue'),
      setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
      flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
      extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
      startListeningToAnimatedNodeValue: record('startListeningToAnimatedNodeValue'),
      stopListeningToAnimatedNodeValue: record('stopListeningToAnimatedNodeValue'),
      getValue: record('getValue'),
      addAnimatedEventToView: record('addAnimatedEventToView'),
      removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
    };
    Object.assign(globalThis, {
      nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
    });
  });

  // why: native decides how to evaluate each node from its `type` alone — every operator MUST
  // carry its own distinct type string, or native would apply the wrong arithmetic op.
  it.each([
    ['addition', () => new AnimatedAddition(new AnimatedValue(1), new AnimatedValue(2))],
    ['subtraction', () => new AnimatedSubtraction(new AnimatedValue(1), new AnimatedValue(2))],
    [
      'multiplication',
      () => new AnimatedMultiplication(new AnimatedValue(1), new AnimatedValue(2)),
    ],
    ['division', () => new AnimatedDivision(new AnimatedValue(1), new AnimatedValue(2))],
    ['modulus', () => new AnimatedModulo(new AnimatedValue(1), 5)],
    ['diffclamp', () => new AnimatedDiffClamp(new AnimatedValue(0), 0, 10)],
  ] as const)('a %s-typed operator node makes a matching native config', (expectedType, create) => {
    expect(configTypeFor(create())).toBe(expectedType);
  });
});
