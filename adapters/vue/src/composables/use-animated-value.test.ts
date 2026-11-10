// RN's `useAnimatedValue`, `useAnimatedValueXY` and `useAnimatedColor` as composables: `setup()`
// runs once, so each call builds one instance for that component
import { defineComponent, h, reactive, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AnimatedColor,
  AnimatedValue,
  AnimatedValueXY,
} from '@symbiote-native/engine';
import {
  mount,
  unmount,
  useAnimatedColor,
  useAnimatedValue,
  useAnimatedValueXY,
} from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 90_411;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function inSetup<T>(composable: () => T): Promise<T> {
  let result: T | undefined;
  const Probe = defineComponent(() => {
    result = composable();
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
  await tick();
  if (result === undefined) throw new Error('setup did not run');
  return result;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('useAnimatedValue', () => {
  it('builds the value from the arguments', async () => {
    const value = await inSetup(() => useAnimatedValue(3));

    expect(value).toBeInstanceOf(AnimatedValue);
    expect(value.__getValue()).toBe(3);
  });

  it('passes the config through', async () => {
    const value = await inSetup(() =>
      useAnimatedValue(0, { useNativeDriver: true }),
    );

    expect(value.__isNative()).toBe(true);
  });

  // `reactive()` would otherwise hand back a Proxy of the node and break its identity
  it('stays the same object inside a reactive container', async () => {
    const value = await inSetup(() => useAnimatedValue(0));

    expect(reactive({ value }).value).toBe(value);
  });
});

describe('useAnimatedValueXY', () => {
  it('builds one pair from the arguments', async () => {
    const xy = await inSetup(() => useAnimatedValueXY({ x: 1, y: 2 }));

    expect(xy).toBeInstanceOf(AnimatedValueXY);
    expect(xy.__getValue()).toEqual({ x: 1, y: 2 });
  });

  it('passes the config through', async () => {
    const xy = await inSetup(() =>
      useAnimatedValueXY({ x: 0, y: 0 }, { useNativeDriver: true }),
    );

    expect(xy.x.__isNative()).toBe(true);
  });
});

describe('useAnimatedColor', () => {
  it('builds one color from the arguments', async () => {
    const color = await inSetup(() => useAnimatedColor('red'));

    expect(color).toBeInstanceOf(AnimatedColor);
    expect(color.__getValue()).toBe('rgba(255, 0, 0, 1)');
  });

  it('passes the config through', async () => {
    const color = await inSetup(() =>
      useAnimatedColor('red', { useNativeDriver: true }),
    );

    expect(color.__isNative()).toBe(true);
  });
});
