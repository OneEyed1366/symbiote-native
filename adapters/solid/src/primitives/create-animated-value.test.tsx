// RN's `useAnimatedValue`, `useAnimatedValueXY` and `useAnimatedColor` as Solid primitives: a
// component body runs once, so each call builds the one instance of that component
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AnimatedColor,
  AnimatedValue,
  AnimatedValueXY,
} from '@symbiote-native/engine';
import {
  createAnimatedColor,
  createAnimatedValue,
  createAnimatedValueXY,
  mount,
  unmount,
} from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 90_412;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function inBody<T>(primitive: () => T): Promise<T> {
  let result: T | undefined;
  function Probe(): null {
    result = primitive();
    return null;
  }
  mount(ROOT_TAG, () => <Probe />);
  await tick();
  if (result === undefined) throw new Error('component body did not run');
  return result;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('createAnimatedValue', () => {
  it('builds the value from the arguments', async () => {
    const value = await inBody(() => createAnimatedValue(3));

    expect(value).toBeInstanceOf(AnimatedValue);
    expect(value.__getValue()).toBe(3);
  });

  it('passes the config through', async () => {
    const value = await inBody(() =>
      createAnimatedValue(0, { useNativeDriver: true }),
    );

    expect(value.__isNative()).toBe(true);
  });
});

describe('createAnimatedValueXY', () => {
  it('builds one pair from the arguments', async () => {
    const xy = await inBody(() => createAnimatedValueXY({ x: 1, y: 2 }));

    expect(xy).toBeInstanceOf(AnimatedValueXY);
    expect(xy.__getValue()).toEqual({ x: 1, y: 2 });
  });

  it('passes the config through', async () => {
    const xy = await inBody(() =>
      createAnimatedValueXY({ x: 0, y: 0 }, { useNativeDriver: true }),
    );

    expect(xy.x.__isNative()).toBe(true);
  });
});

describe('createAnimatedColor', () => {
  it('builds one color from the arguments', async () => {
    const color = await inBody(() => createAnimatedColor('red'));

    expect(color).toBeInstanceOf(AnimatedColor);
    expect(color.__getValue()).toBe('rgba(255, 0, 0, 1)');
  });

  it('passes the config through', async () => {
    const color = await inBody(() =>
      createAnimatedColor('red', { useNativeDriver: true }),
    );

    expect(color.__isNative()).toBe(true);
  });
});
