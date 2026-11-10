// RN's `useAnimatedValue`, `useAnimatedValueXY` and `useAnimatedColor` for Svelte: a component's
// script runs once, so a call is the one instance of that component, no rune is involved
import { describe, expect, it } from 'vitest';
import {
  AnimatedColor,
  AnimatedValue,
  AnimatedValueXY,
} from '@symbiote-native/engine';
import {
  useAnimatedColor,
  useAnimatedValue,
  useAnimatedValueXY,
} from './use-animated-value';

describe('useAnimatedValue', () => {
  it('builds the value from the arguments', () => {
    const value = useAnimatedValue(3);

    expect(value).toBeInstanceOf(AnimatedValue);
    expect(value.__getValue()).toBe(3);
  });

  it('passes the config through', () => {
    expect(useAnimatedValue(0, { useNativeDriver: true }).__isNative()).toBe(
      true,
    );
  });
});

describe('useAnimatedValueXY', () => {
  it('builds one pair from the arguments', () => {
    const xy = useAnimatedValueXY({ x: 1, y: 2 });

    expect(xy).toBeInstanceOf(AnimatedValueXY);
    expect(xy.__getValue()).toEqual({ x: 1, y: 2 });
  });

  it('passes the config through', () => {
    const xy = useAnimatedValueXY({ x: 0, y: 0 }, { useNativeDriver: true });

    expect(xy.x.__isNative()).toBe(true);
  });
});

describe('useAnimatedColor', () => {
  it('builds one color from the arguments', () => {
    const color = useAnimatedColor('red');

    expect(color).toBeInstanceOf(AnimatedColor);
    expect(color.__getValue()).toBe('rgba(255, 0, 0, 1)');
  });

  it('passes the config through', () => {
    expect(
      useAnimatedColor('red', { useNativeDriver: true }).__isNative(),
    ).toBe(true);
  });
});
