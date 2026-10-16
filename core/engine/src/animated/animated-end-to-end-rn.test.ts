// Порт кейсов end to end, spring, JSON и `useNativeDriver` из `Animated-test.js` RN

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AnimatedProps,
  AnimatedValue,
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
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Animated end to end', () => {
  it('works end to end', () => {
    const anim = new AnimatedValue(0);
    const translateAnim = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [100, 200],
    });
    const callback = vi.fn();
    const node = new AnimatedProps(
      {
        style: {
          backgroundColor: 'red',
          opacity: anim,
          transform: [
            { translate: [translateAnim, translateAnim] },
            { translateX: translateAnim },
            { scale: anim },
          ],
          shadowOffset: { width: anim, height: anim },
        },
      },
      callback,
    );

    expect(node.__getValue()).toEqual({
      style: {
        backgroundColor: 'red',
        opacity: 0,
        transform: [
          { translate: [100, 100] },
          { translateX: 100 },
          { scale: 0 },
        ],
        shadowOffset: { width: 0, height: 0 },
      },
    });
    expect(anim.__getChildren()).toHaveLength(0);

    node.__attach();
    anim.setValue(0.5);
    expect(callback).toHaveBeenCalled();
    expect(node.__getValue()).toEqual({
      style: {
        backgroundColor: 'red',
        opacity: 0.5,
        transform: [
          { translate: [150, 150] },
          { translateX: 150 },
          { scale: 0.5 },
        ],
        shadowOffset: { width: 0.5, height: 0.5 },
      },
    });

    node.__detach();
    expect(anim.__getChildren()).toHaveLength(0);
    anim.setValue(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('triggers the callback when a spring is at rest', () => {
    const anim = new AnimatedValue(0);
    const callback = vi.fn();
    spring(anim, { toValue: 0, velocity: 0, useNativeDriver: false }).start(
      callback,
    );
    expect(callback).toHaveBeenCalled();
  });

  it('sends toValue when a critically damped spring stops', () => {
    const anim = new AnimatedValue(0);
    const listener = vi.fn();
    anim.addListener(listener);
    spring(anim, {
      stiffness: 8_000,
      damping: 2_000,
      toValue: 15,
      useNativeDriver: false,
    }).start();
    vi.runAllTimers();
    const beforeLast = listener.mock.calls[listener.mock.calls.length - 2][0];
    expect(beforeLast.value).not.toBe(15);
    expect(beforeLast.value).toBeCloseTo(15);
    expect(anim.__getValue()).toBe(15);
  });

  it('converts to JSON', () => {
    expect(JSON.stringify(new AnimatedValue(10))).toBe('10');
  });

  it('warns if the native driver flag is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    spring(new AnimatedValue(0), { toValue: 0, velocity: 0 }).start();
    expect(warn).toHaveBeenCalledWith(
      'Animated: `useNativeDriver` was not specified. This is a required option and must be explicitly set to `true` or `false`',
    );
  });

  it.each([0, 100])(
    'throws synchronously on a JS animation of a native value (delay %i)',
    delay => {
      const value = new AnimatedValue(0);
      value.__makeNative();
      const animation = spring(value, {
        delay,
        toValue: 0,
        velocity: 0,
        useNativeDriver: false,
      });
      expect(() => {
        animation.start();
      }).toThrow(
        'Attempting to run JS driven animation on animated node that has ' +
          'been moved to "native" earlier by starting an animation with ' +
          '`useNativeDriver: true`',
      );
    },
  );

  it('returns the original style when it has no animated nodes', () => {
    const style = { color: 'red' };
    expect(new AnimatedProps({ style }).__getValue().style).toBe(style);
  });

  it.each([undefined, null, () => {}, true, 123, 'foo'])(
    'returns the original value for an invalid style (%s)',
    value => {
      expect(new AnimatedProps({ style: value }).__getValue()).toEqual({
        style: value,
      });
    },
  );

  it('reaches the target with a zero-duration timing', () => {
    const value = new AnimatedValue(0);
    timing(value, { toValue: 1, duration: 0, useNativeDriver: false }).start();
    vi.runAllTimers();
    expect(value.__getValue()).toBe(1);
  });
});
