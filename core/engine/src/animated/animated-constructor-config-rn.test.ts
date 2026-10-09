// RN's `AnimatedValueXY` and `AnimatedColor` take `(value, config)` and call `__makeNative()` for
// `useNativeDriver`, which is what `useAnimatedValueXY` / `useAnimatedColor` pass through
import { describe, expect, it } from 'vitest';
import {
  AnimatedColor,
  AnimatedValue,
  AnimatedValueXY,
} from '@symbiote-native/engine';

describe('AnimatedValueXY config', () => {
  it('useNativeDriver marks both axes native', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 }, { useNativeDriver: true });

    expect(xy.x.__isNative()).toBe(true);
    expect(xy.y.__isNative()).toBe(true);
  });

  it('stays JS-driven without the flag', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 }, { useNativeDriver: false });

    expect(xy.x.__isNative()).toBe(false);
    expect(xy.y.__isNative()).toBe(false);
  });

  it('keeps the axes it was given', () => {
    const x = new AnimatedValue(3);
    const y = new AnimatedValue(4);
    const xy = new AnimatedValueXY({ x, y }, { useNativeDriver: true });

    expect(xy.x).toBe(x);
    expect(x.__isNative()).toBe(true);
  });
});

describe('AnimatedColor config', () => {
  it('useNativeDriver marks the node and every channel native', () => {
    const color = new AnimatedColor('red', { useNativeDriver: true });

    expect(color.__isNative()).toBe(true);
    expect(color.r.__isNative()).toBe(true);
    expect(color.a.__isNative()).toBe(true);
  });

  it('stays JS-driven without the flag', () => {
    const color = new AnimatedColor('red', { useNativeDriver: false });

    expect(color.__isNative()).toBe(false);
  });
});
