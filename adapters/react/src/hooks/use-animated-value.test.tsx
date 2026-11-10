// RN's `useAnimatedValue`, `useAnimatedValueXY` and `useAnimatedColor`: one instance per component,
// built on the first render from the arguments of that render
import { useState } from 'react';
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
} from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 90_410;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Every render of the probe records what the hook returned, then one forced re-render follows
async function renderTwice<T extends object>(hook: () => T): Promise<T[]> {
  const seen: T[] = [];
  let rerender: () => void = () => {};
  function Probe(): null {
    const [, setCount] = useState(0);
    rerender = () => setCount(count => count + 1);
    seen.push(hook());
    return null;
  }
  mount(ROOT_TAG, <Probe />);
  await tick();
  rerender();
  await tick();
  return seen;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('useAnimatedValue', () => {
  it('builds the value once from the first arguments', async () => {
    let initial = 3;
    const seen = await renderTwice(() => useAnimatedValue(initial++));

    expect(seen.length).toBeGreaterThan(1);
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]).toBeInstanceOf(AnimatedValue);
    expect(seen[0]?.__getValue()).toBe(3);
  });

  it('passes the config through', async () => {
    const seen = await renderTwice(() =>
      useAnimatedValue(0, { useNativeDriver: true }),
    );

    expect(seen[0]?.__isNative()).toBe(true);
  });
});

describe('useAnimatedValueXY', () => {
  it('builds one pair from the first arguments', async () => {
    const seen = await renderTwice(() => useAnimatedValueXY({ x: 1, y: 2 }));

    expect(new Set(seen).size).toBe(1);
    expect(seen[0]).toBeInstanceOf(AnimatedValueXY);
    expect(seen[0]?.__getValue()).toEqual({ x: 1, y: 2 });
  });

  it('passes the config through', async () => {
    const seen = await renderTwice(() =>
      useAnimatedValueXY({ x: 0, y: 0 }, { useNativeDriver: true }),
    );

    expect(seen[0]?.x.__isNative()).toBe(true);
  });
});

describe('useAnimatedColor', () => {
  it('builds one color from the first arguments', async () => {
    const seen = await renderTwice(() => useAnimatedColor('red'));

    expect(new Set(seen).size).toBe(1);
    expect(seen[0]).toBeInstanceOf(AnimatedColor);
    expect(seen[0]?.__getValue()).toBe('rgba(255, 0, 0, 1)');
  });

  it('passes the config through', async () => {
    const seen = await renderTwice(() =>
      useAnimatedColor('red', { useNativeDriver: true }),
    );

    expect(seen[0]?.__isNative()).toBe(true);
  });
});
