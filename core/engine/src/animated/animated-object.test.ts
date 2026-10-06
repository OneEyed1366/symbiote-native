// Порт `AnimatedObject-test.js` RN и интеграция в `AnimatedStyle` и `AnimatedProps`

import { describe, expect, it } from 'vitest';
import {
  AnimatedProps,
  AnimatedStyle,
  AnimatedValue,
  reduceProps,
} from '@symbiote-native/engine';
import { AnimatedObject } from './object';

function sampleNode(anim: AnimatedValue) {
  const translateAnim = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 200],
  });
  const node = AnimatedObject.from([
    { translate: [translateAnim, translateAnim] },
    { translateX: translateAnim },
    { scale: anim },
  ]);
  return { node, translateAnim };
}

describe('AnimatedObject', () => {
  it('gets the proper value', () => {
    const { node } = sampleNode(new AnimatedValue(0));
    expect(node?.__getValue()).toEqual([
      { translate: [100, 100] },
      { translateX: 100 },
      { scale: 0 },
    ]);
  });

  it('makes all nested AnimatedNodes native', () => {
    Object.assign(globalThis, {
      nativeModuleProxy: {
        NativeAnimatedTurboModule: {
          createAnimatedNode: () => {},
          connectAnimatedNodes: () => {},
          disconnectAnimatedNodes: () => {},
          dropAnimatedNode: () => {},
        },
      },
    });
    const anim = new AnimatedValue(0);
    const { node, translateAnim } = sampleNode(anim);
    node?.__makeNative();
    expect(node?.__isNative()).toBe(true);
    expect(anim.__isNative()).toBe(true);
    expect(translateAnim.__isNative()).toBe(true);
  });

  it('detects animated nodes', () => {
    const anim = new AnimatedValue(0);
    expect(AnimatedObject.from(10)).toBeUndefined();
    expect(AnimatedObject.from(anim)).toBeDefined();
    expect(AnimatedObject.from([10, 10])).toBeUndefined();
    expect(AnimatedObject.from([10, anim])).toBeDefined();
    expect(AnimatedObject.from({ a: 10, b: 10 })).toBeUndefined();
    expect(AnimatedObject.from({ a: 10, b: anim })).toBeDefined();
    expect(
      AnimatedObject.from({ a: 10, b: { ba: 10, bb: 10 } }),
    ).toBeUndefined();
    expect(
      AnimatedObject.from({ a: 10, b: { ba: 10, bb: anim } }),
    ).toBeDefined();
    expect(AnimatedObject.from({ a: 10, b: [10, 10] })).toBeUndefined();
    expect(AnimatedObject.from({ a: 10, b: [10, anim] })).toBeDefined();
  });

  it('does not walk into class instances', () => {
    class Holder {
      constructor(readonly anim: AnimatedValue) {}
    }
    expect(
      AnimatedObject.from(new Holder(new AnimatedValue(0))),
    ).toBeUndefined();
  });

  it('stops looking past the depth limit', () => {
    const anim = new AnimatedValue(0);
    const deep = { a: { b: { c: { d: { e: anim } } } } };
    expect(AnimatedObject.from(deep)).toBeUndefined();
  });

  it('subscribes to its nodes on attach and unsubscribes on detach', () => {
    const anim = new AnimatedValue(0);
    const node = AnimatedObject.from({ a: anim });
    node?.__attach();
    expect(anim.__getChildren()).toContain(node);
    node?.__detach();
    expect(anim.__getChildren()).not.toContain(node);
  });
});

describe('AnimatedStyle with nested animated values', () => {
  it('rasterizes a style object holding animated values', () => {
    const anim = new AnimatedValue(3);
    const style = AnimatedStyle.from({
      shadowOffset: { width: anim, height: 2 },
      opacity: 1,
    });
    expect(style?.__getValue()).toEqual({
      shadowOffset: { width: 3, height: 2 },
      opacity: 1,
    });
  });
});

describe('reduceProps with nested animated values', () => {
  it('replaces nested animated values with their current value', () => {
    const anim = new AnimatedValue(4);
    expect(reduceProps({ config: { depth: anim }, label: 'x' })).toEqual({
      config: { depth: 4 },
      label: 'x',
      collapsable: false,
    });
  });

  it('keeps the view out of flattening, as RN reduceAnimatedProps', () => {
    expect(reduceProps({}).collapsable).toBe(false);
  });

  it('leaves children untouched', () => {
    const child = { type: 'view', props: {} };
    expect(reduceProps({ children: child }).children).toBe(child);
  });
});

describe('AnimatedProps with nested animated values', () => {
  it('rasterizes a non-style prop holding animated values', () => {
    const anim = new AnimatedValue(5);
    const props = new AnimatedProps({ config: { depth: anim }, label: 'x' });
    expect(props.__getValue()).toEqual({ config: { depth: 5 }, label: 'x' });
  });

  it('returns the original style when it holds no animated node', () => {
    const style = { color: 'red' };
    expect(new AnimatedProps({ style }).__getValue().style).toBe(style);
  });
});
