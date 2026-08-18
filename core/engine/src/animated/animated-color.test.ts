// Unit test for AnimatedColor: input forms parse to r/g/b/a channels, __getValue() is the rgba()
// string the commit color path expects, driving a channel re-pulls it, setValue fires listeners
// ONCE with the FINAL color and commits each bound leaf ONCE, offset methods fan out per channel,
// and useNativeDriver mirrors a `color` node referencing the four channel tags. A fake native
// module records the native config.
//
// No Negative group: every AnimatedColor input path (constructor, setValue) resolves through
// `normalizeColor(...) ?? DEFAULT_COLOR` — an unparseable string never throws, it silently
// falls back to opaque black. There is no invalid input this unit rejects; the "Fallback" group
// below covers that defensive behavior instead of inventing a throw that doesn't exist.

import { beforeAll, describe, expect, it } from 'vitest';
import {
  AnimatedColor,
  AnimatedValue,
  AnimatedWithChildren,
} from '@symbiote-native/engine';

describe('AnimatedColor — Positive (input forms parse to channels)', () => {
  it('parses a 6-digit hex', () => {
    expect(new AnimatedColor('#ff8800').__getValue()).toBe(
      'rgba(255, 136, 0, 1)',
    );
  });

  it('parses a 3-digit shorthand hex', () => {
    expect(new AnimatedColor('#f80').__getValue()).toBe('rgba(255, 136, 0, 1)');
  });

  it('parses an rgba() string', () => {
    expect(new AnimatedColor('rgba(10, 20, 30, 0.5)').__getValue()).toBe(
      'rgba(10, 20, 30, 0.5)',
    );
  });

  it('parses the rgba object form', () => {
    expect(new AnimatedColor({ r: 1, g: 2, b: 3, a: 1 }).__getValue()).toBe(
      'rgba(1, 2, 3, 1)',
    );
  });

  // why: an omitted constructor argument must default to opaque black, matching RN's
  // AnimatedColor default, not an unset/undefined channel that would break __getValue's rgba()
  // formatting.
  it('defaults to opaque black when constructed with no value', () => {
    expect(new AnimatedColor().__getValue()).toBe('rgba(0, 0, 0, 1)');
  });

  it('re-pulls the composed string when a channel value changes', () => {
    const red = new AnimatedValue(0);
    const color = new AnimatedColor({ r: red, g: 0, b: 0, a: 1 });
    expect(color.__getValue()).toBe('rgba(0, 0, 0, 1)');
    red.setValue(200);
    expect(color.__getValue()).toBe('rgba(200, 0, 0, 1)');
  });

  // why: setOffset/flattenOffset/extractOffset fan out per channel exactly like a plain
  // AnimatedValue's own offset API — an animated-color transition can be offset the same way a
  // scalar value can.
  it('setOffset applies per channel on top of each channel base value', () => {
    const color = new AnimatedColor({ r: 10, g: 10, b: 10, a: 0.5 });
    color.setOffset({ r: 5, g: 0, b: 0, a: 0 });
    expect(color.__getValue()).toBe('rgba(15, 10, 10, 0.5)');
  });

  it('flattenOffset folds each channel offset into its base, output unchanged', () => {
    const color = new AnimatedColor({ r: 10, g: 10, b: 10, a: 0.5 });
    color.setOffset({ r: 5, g: 0, b: 0, a: 0 });
    color.flattenOffset();
    expect(color.__getValue()).toBe('rgba(15, 10, 10, 0.5)');
    color.setOffset({ r: 0, g: 0, b: 0, a: 0 });
    expect(color.__getValue()).toBe('rgba(15, 10, 10, 0.5)'); // fold really happened
  });

  it('extractOffset moves each channel base into its offset, output unchanged', () => {
    const color = new AnimatedColor({ r: 10, g: 20, b: 30, a: 1 });
    color.extractOffset();
    expect(color.__getValue()).toBe('rgba(10, 20, 30, 1)');
  });

  it('stopAnimation invokes its callback with the current composed color', () => {
    const color = new AnimatedColor({ r: 1, g: 2, b: 3, a: 1 });
    let observed: string | undefined;
    color.stopAnimation(v => {
      observed = v;
    });
    expect(observed).toBe('rgba(1, 2, 3, 1)');
  });

  // why: __attach/__detach wire ALL FOUR channels as this color's graph children — a color
  // gaining its first downstream consumer must register on every channel (not just r), or a g/b/a
  // change alone would never propagate to the leaf.
  it('__attach registers the color as a child of all four channels; __detach removes it from all four', () => {
    const r = new AnimatedValue(0);
    const g = new AnimatedValue(0);
    const b = new AnimatedValue(0);
    const a = new AnimatedValue(1);
    const color = new AnimatedColor({ r, g, b, a });
    const consumer = new AnimatedWithChildren();
    // AnimatedColor attaches lazily: only once something downstream starts listening.
    color.__addChild(consumer);

    expect(r.__getChildren()).toContain(color);
    expect(g.__getChildren()).toContain(color);
    expect(b.__getChildren()).toContain(color);
    expect(a.__getChildren()).toContain(color);

    color.__removeChild(consumer);
    expect(r.__getChildren()).not.toContain(color);
    expect(g.__getChildren()).not.toContain(color);
    expect(b.__getChildren()).not.toContain(color);
    expect(a.__getChildren()).not.toContain(color);
  });
});

describe('AnimatedColor — Fallback (silent default instead of throwing — see file header)', () => {
  it('falls back to default black on an unparseable named color', () => {
    expect(new AnimatedColor('rebeccapurple').__getValue()).toBe(
      'rgba(0, 0, 0, 1)',
    );
  });

  it('never throws for an unparseable color: constructing and reading it is safe inside a render', () => {
    expect(() => new AnimatedColor('rebeccapurple').__getValue()).not.toThrow();
  });
});

// A minimal bound leaf: counting update() calls counts the view commits this color drives.
class CommitCountingLeaf extends AnimatedWithChildren {
  commits = 0;
  constructor(private readonly source: AnimatedColor) {
    super();
    source.__addChild(this);
  }
  update(): void {
    this.commits++;
    this.source.__getValue();
  }
}

describe('AnimatedColor — setValue fires once with the final color and commits once', () => {
  // why: AnimatedColor.setValue drives all four channels; without the _withSuspendedCallbacks
  // guard, one setValue would fire color listeners four times (each an intermediate rgba) and
  // re-commit each bound leaf four times — an observable perf/correctness regression this test
  // guards against structurally, not just "it still works".
  it('fires the listener exactly once with the final color and commits the leaf once', () => {
    const observed = new AnimatedColor({ r: 0, g: 0, b: 0, a: 1 });
    const leaf = new CommitCountingLeaf(observed);
    const fires: string[] = [];
    observed.addListener(state => {
      expect(typeof state.value).toBe('string');
      if (typeof state.value === 'string') fires.push(state.value);
    });

    observed.setValue({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(fires).toEqual(['rgba(10, 20, 30, 0.5)']);
    expect(leaf.commits).toBe(1);

    // A second setValue fires exactly once more (no leakage across calls).
    observed.setValue('#01020304');
    expect(fires).toHaveLength(2);
    expect(fires[1].startsWith('rgba(1, 2, 3,')).toBe(true);
    expect(leaf.commits).toBe(2);
  });
});

interface INativeCall {
  method: string;
  args: unknown[];
}

describe('AnimatedColor — native color node references the four channel tags', () => {
  const nativeCalls: INativeCall[] = [];

  function record(method: string): (...args: unknown[]) => void {
    return (...args: unknown[]) => {
      nativeCalls.push({ method, args });
    };
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
      startListeningToAnimatedNodeValue: record(
        'startListeningToAnimatedNodeValue',
      ),
      stopListeningToAnimatedNodeValue: record(
        'stopListeningToAnimatedNodeValue',
      ),
      getValue: record('getValue'),
      addAnimatedEventToView: record('addAnimatedEventToView'),
      removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
    };
    Object.assign(globalThis, {
      nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
    });
  });

  it('creates a "color" animated node carrying numeric r/g/b/a channel tags', () => {
    const nativeColor = new AnimatedColor('#01020304');
    nativeColor.__makeNative();

    const colorCreate = nativeCalls.find(call => {
      const config = call.args[1];
      return (
        typeof config === 'object' &&
        config !== null &&
        'type' in config &&
        config.type === 'color'
      );
    });
    expect(colorCreate, 'a "color" animated node was created').toBeDefined();

    const colorConfig = colorCreate?.args[1];
    expect(typeof colorConfig === 'object' && colorConfig !== null).toBe(true);
    if (typeof colorConfig === 'object' && colorConfig !== null) {
      for (const channel of ['r', 'g', 'b', 'a']) {
        expect(typeof Reflect.get(colorConfig, channel)).toBe('number');
      }
    }
  });

  // why: __makeNative must cascade to ALL FOUR channels — a color node that is native but whose
  // channels aren't would leave native driving a color with no live inputs.
  it('__makeNative marks all four channels native too', () => {
    const r = new AnimatedValue(0);
    const g = new AnimatedValue(0);
    const b = new AnimatedValue(0);
    const a = new AnimatedValue(1);
    const color = new AnimatedColor({ r, g, b, a });

    color.__makeNative();

    expect(r.__isNative()).toBe(true);
    expect(g.__isNative()).toBe(true);
    expect(b.__isNative()).toBe(true);
    expect(a.__isNative()).toBe(true);
  });
});
