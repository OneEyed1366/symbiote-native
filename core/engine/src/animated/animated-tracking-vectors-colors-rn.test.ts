// Порт кейсов Tracking, Vectors и Colors из `Animated-test.js` RN

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AnimatedColor,
  AnimatedProps,
  AnimatedValue,
  AnimatedValueXY,
  PlatformColor,
  spring,
  timing,
} from '@symbiote-native/engine';

const FRAME_MS = 16;

// В Node нет `requestAnimationFrame`, кадры идут через фейковый `setTimeout`
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: () => void): number =>
      Number(setTimeout(callback, FRAME_MS)),
    cancelAnimationFrame: (handle: number): void => clearTimeout(handle),
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  vi.useRealTimers();
});

describe('Animated Tracking', () => {
  it('tracks values', () => {
    const value1 = new AnimatedValue(0);
    const value2 = new AnimatedValue(0);
    timing(value2, {
      toValue: value1,
      duration: 0,
      useNativeDriver: false,
    }).start();
    value1.setValue(42);
    expect(value2.__getValue()).toBe(42);
    value1.setValue(7);
    expect(value2.__getValue()).toBe(7);
  });

  it('tracks interpolated values', () => {
    const value1 = new AnimatedValue(0);
    const value2 = new AnimatedValue(0);
    timing(value2, {
      toValue: value1.interpolate({ inputRange: [0, 2], outputRange: [0, 1] }),
      duration: 0,
      useNativeDriver: false,
    }).start();
    value1.setValue(42);
    expect(value2.__getValue()).toBe(42 / 2);
  });

  it('stops tracking when animated', () => {
    const value1 = new AnimatedValue(0);
    const value2 = new AnimatedValue(0);
    timing(value2, {
      toValue: value1,
      duration: 0,
      useNativeDriver: false,
    }).start();
    value1.setValue(42);
    expect(value2.__getValue()).toBe(42);
    timing(value2, { toValue: 7, duration: 0, useNativeDriver: false }).start();
    value1.setValue(1_492);
    expect(value2.__getValue()).toBe(7);
  });

  it('starts tracking immediately on animation start', () => {
    const value1 = new AnimatedValue(42);
    const value2 = new AnimatedValue(0);
    timing(value2, {
      toValue: value1,
      duration: 0,
      useNativeDriver: false,
    }).start();
    expect(value2.__getValue()).toBe(42);
    value1.setValue(7);
    expect(value2.__getValue()).toBe(7);
  });
});

describe('Animated Vectors', () => {
  it('animates vectors', () => {
    const vec = new AnimatedValueXY();
    const callback = vi.fn();
    const node = new AnimatedProps(
      {
        style: {
          opacity: vec.x.interpolate({
            inputRange: [0, 42],
            outputRange: [0.2, 0.8],
          }),
          transform: vec.getTranslateTransform(),
          ...vec.getLayout(),
        },
      },
      callback,
    );

    expect(node.__getValue()).toEqual({
      style: {
        opacity: 0.2,
        transform: [{ translateX: 0 }, { translateY: 0 }],
        left: 0,
        top: 0,
      },
    });

    node.__attach();
    expect(callback).toHaveBeenCalledTimes(0);

    vec.setValue({ x: 42, y: 1_492 });
    expect(callback).toHaveBeenCalledTimes(2);
    expect(node.__getValue()).toEqual({
      style: {
        opacity: 0.8,
        transform: [{ translateX: 42 }, { translateY: 1_492 }],
        left: 42,
        top: 1_492,
      },
    });

    node.__detach();
    vec.setValue({ x: 1, y: 1 });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('tracks vectors', () => {
    const value1 = new AnimatedValueXY();
    const value2 = new AnimatedValueXY();
    timing(value2, {
      toValue: value1,
      duration: 0,
      useNativeDriver: false,
    }).start();
    value1.setValue({ x: 42, y: 1_492 });
    expect(value2.__getValue()).toEqual({ x: 42, y: 1_492 });

    value1.setValue({ x: 3, y: 4 });
    expect(value2.__getValue()).toEqual({ x: 3, y: 4 });
  });

  it('tracks vectors with springs', () => {
    const value1 = new AnimatedValueXY();
    const value2 = new AnimatedValueXY();
    spring(value2, {
      toValue: value1,
      tension: 3_000,
      friction: 60,
      useNativeDriver: false,
    }).start();
    value1.setValue({ x: 1, y: 1 });
    vi.runAllTimers();
    expect(Math.round(value2.__getValue().x)).toBe(1);
    expect(Math.round(value2.__getValue().y)).toBe(1);
    value1.setValue({ x: 2, y: 2 });
    vi.runAllTimers();
    expect(Math.round(value2.__getValue().x)).toBe(2);
    expect(Math.round(value2.__getValue().y)).toBe(2);
  });
});

describe('Animated Colors', () => {
  it('normalizes colors', () => {
    expect(new AnimatedColor().__getValue()).toBe('rgba(0, 0, 0, 1)');
    expect(new AnimatedColor({ r: 11, g: 22, b: 33, a: 1 }).__getValue()).toBe(
      'rgba(11, 22, 33, 1)',
    );
    expect(new AnimatedColor('rgba(255, 0, 0, 1.0)').__getValue()).toBe(
      'rgba(255, 0, 0, 1)',
    );
    expect(new AnimatedColor('#ff0000ff').__getValue()).toBe(
      'rgba(255, 0, 0, 1)',
    );
    expect(new AnimatedColor('red').__getValue()).toBe('rgba(255, 0, 0, 1)');
    expect(
      new AnimatedColor({
        r: new AnimatedValue(255),
        g: new AnimatedValue(0),
        b: new AnimatedValue(0),
        a: new AnimatedValue(1),
      }).__getValue(),
    ).toBe('rgba(255, 0, 0, 1)');
    expect(new AnimatedColor('unknown').__getValue()).toBe('rgba(0, 0, 0, 1)');
  });

  it('animates colors', () => {
    const color = new AnimatedColor({ r: 255, g: 0, b: 0, a: 1 });
    const callback = vi.fn();
    const node = new AnimatedProps(
      {
        style: {
          backgroundColor: color,
          transform: [
            {
              scale: color.a.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 2],
              }),
            },
          ],
        },
      },
      callback,
    );

    expect(node.__getValue()).toEqual({
      style: {
        backgroundColor: 'rgba(255, 0, 0, 1)',
        transform: [{ scale: 2 }],
      },
    });

    node.__attach();
    expect(callback).not.toHaveBeenCalled();

    // RN обновляет лист на каждом канале (5 раз), у нас один flush на `setValue`
    color.setValue({ r: 11, g: 22, b: 33, a: 0.5 });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(node.__getValue()).toEqual({
      style: {
        backgroundColor: 'rgba(11, 22, 33, 0.5)',
        transform: [{ scale: 1.5 }],
      },
    });

    node.__detach();
    color.setValue({ r: 255, g: 0, b: 0, a: 1 });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('tracks colors', () => {
    const color1 = new AnimatedColor();
    const color2 = new AnimatedColor();
    timing(color2, {
      toValue: color1,
      duration: 0,
      useNativeDriver: false,
    }).start();
    color1.setValue({ r: 11, g: 22, b: 33, a: 0.5 });
    expect(color2.__getValue()).toBe('rgba(11, 22, 33, 0.5)');

    color1.setValue({ r: 255, g: 0, b: 0, a: 1 });
    expect(color2.__getValue()).toBe('rgba(255, 0, 0, 1)');
  });

  it('tracks colors with springs', () => {
    const color1 = new AnimatedColor();
    const color2 = new AnimatedColor();
    spring(color2, {
      toValue: color1,
      tension: 3_000,
      friction: 60,
      useNativeDriver: false,
    }).start();
    color1.setValue({ r: 11, g: 22, b: 33, a: 0.5 });
    vi.runAllTimers();
    expect(color2.__getValue()).toBe('rgba(11, 22, 33, 0.5)');
    color1.setValue({ r: 44, g: 55, b: 66, a: 0 });
    vi.runAllTimers();
    expect(color2.__getValue()).toBe('rgba(44, 55, 66, 0)');
  });

  it('provides updates for native colors', () => {
    const color = new AnimatedColor('red');
    const listener = vi.fn();
    color.addListener(listener);
    const callback = vi.fn();
    const node = new AnimatedProps({ style: { color } }, callback);
    node.__attach();

    color.setValue('blue');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ value: 'rgba(0, 0, 255, 1)' });
    expect(color.__getValue()).toBe('rgba(0, 0, 255, 1)');

    callback.mockClear();
    listener.mockClear();

    color.setValue(PlatformColor('bar'));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ value: PlatformColor('bar') });
    expect(color.__getValue()).toEqual(PlatformColor('bar'));
  });
});
