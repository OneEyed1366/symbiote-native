import '@angular/compiler';
// RN's `useAnimatedValue`, `useAnimatedValueXY` and `useAnimatedColor` for Angular, spelled
// `inject*` like the adapter's other lifecycle helpers: a class field initializer runs once per
// instance, so a call is the one instance of that component
import { describe, expect, it } from 'vitest';
import {
  AnimatedColor,
  AnimatedValue,
  AnimatedValueXY,
} from '@symbiote-native/engine';
import {
  injectAnimatedColor,
  injectAnimatedValue,
  injectAnimatedValueXY,
} from '@symbiote-native/angular';

describe('injectAnimatedValue', () => {
  it('builds the value from the arguments', () => {
    const value = injectAnimatedValue(3);

    expect(value).toBeInstanceOf(AnimatedValue);
    expect(value.__getValue()).toBe(3);
  });

  it('passes the config through', () => {
    expect(injectAnimatedValue(0, { useNativeDriver: true }).__isNative()).toBe(
      true,
    );
  });
});

describe('injectAnimatedValueXY', () => {
  it('builds one pair from the arguments', () => {
    const xy = injectAnimatedValueXY({ x: 1, y: 2 });

    expect(xy).toBeInstanceOf(AnimatedValueXY);
    expect(xy.__getValue()).toEqual({ x: 1, y: 2 });
  });

  it('passes the config through', () => {
    const xy = injectAnimatedValueXY({ x: 0, y: 0 }, { useNativeDriver: true });

    expect(xy.x.__isNative()).toBe(true);
  });
});

describe('injectAnimatedColor', () => {
  it('builds one color from the arguments', () => {
    const color = injectAnimatedColor('red');

    expect(color).toBeInstanceOf(AnimatedColor);
    expect(color.__getValue()).toBe('rgba(255, 0, 0, 1)');
  });

  it('passes the config through', () => {
    expect(
      injectAnimatedColor('red', { useNativeDriver: true }).__isNative(),
    ).toBe(true);
  });
});
