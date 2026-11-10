// Порт `AnimatedMock-test.js` и состава `AnimatedImplementation` из RN

import { describe, expect, it } from 'vitest';
import {
  AnimatedColor,
  AnimatedDrivers,
  AnimatedMock,
  AnimatedValue,
  AnimatedValueXY,
} from '@symbiote-native/engine';

// Состав `Animated` в RN без `createAnimatedComponent`, который приходит из адаптера
const RN_DRIVER_KEYS = [
  'Color',
  'Event',
  'Interpolation',
  'Node',
  'Value',
  'ValueXY',
  'add',
  'attachNativeEvent',
  'decay',
  'delay',
  'diffClamp',
  'divide',
  'event',
  'forkEvent',
  'loop',
  'modulo',
  'multiply',
  'parallel',
  'sequence',
  'spring',
  'stagger',
  'subtract',
  'timing',
  'unforkEvent',
];

describe('Animated namespace', () => {
  it('carries every member RN exports from AnimatedImplementation', () => {
    expect(Object.keys(AnimatedDrivers)).toEqual(
      expect.arrayContaining(RN_DRIVER_KEYS),
    );
  });

  it('mock matches implementation keys', () => {
    expect(Object.keys(AnimatedMock).sort()).toEqual(
      Object.keys(AnimatedDrivers).sort(),
    );
  });

  it('mock matches implementation params', () => {
    for (const key of Object.keys(AnimatedDrivers)) {
      const real = Reflect.get(AnimatedDrivers, key);
      const mock = Reflect.get(AnimatedMock, key);
      expect(typeof mock, key).toBe(typeof real);
      if (typeof real === 'function' && typeof mock === 'function') {
        expect(mock.length, key).toBe(real.length);
      }
    }
  });
});

describe('AnimatedMock vectors', () => {
  it('lands a vector at its target synchronously', () => {
    const vec = new AnimatedValueXY();
    let finished = false;
    AnimatedMock.timing(vec, {
      toValue: { x: 3, y: 4 },
      duration: 1_000,
    }).start(result => {
      finished = result.finished;
    });
    expect(vec.__getValue()).toEqual({ x: 3, y: 4 });
    expect(finished).toBe(true);
  });

  it('lands a color at its target synchronously', () => {
    const color = new AnimatedColor();
    AnimatedMock.spring(color, {
      toValue: { r: 11, g: 22, b: 33, a: 0.5 },
    }).start();
    expect(color.__getValue()).toBe('rgba(11, 22, 33, 0.5)');
  });

  it('keeps scalar behavior', () => {
    const value = new AnimatedValue(0);
    AnimatedMock.timing(value, { toValue: 5 }).start();
    expect(value.__getValue()).toBe(5);
  });
});
