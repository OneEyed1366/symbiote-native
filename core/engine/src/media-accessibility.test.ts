// `prefers-reduced-motion` follows the accessibility module, from the read and from the event
// Modules are re-imported per test, since both the registry and the follower keep state

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type IDeviceHub = { emit: (eventType: string, ...args: unknown[]) => void };

let isMotionReduced: boolean;
let deviceHub: IDeviceHub | undefined;

beforeEach(() => {
  isMotionReduced = true;
  deviceHub = undefined;
  const callbackGetter =
    (read: () => boolean) =>
    (resolve: (isOn: boolean) => void): void => {
      resolve(read());
    };
  const accessibilityManager = {
    getCurrentReduceMotionState: callbackGetter(() => isMotionReduced),
    getCurrentReduceTransparencyState: callbackGetter(() => false),
    getCurrentDarkerSystemColorsState: callbackGetter(() => false),
    addListener: (): void => {},
    removeListeners: (): void => {},
  };
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module: unknown =
      name === 'AccessibilityManager' ? accessibilityManager : null;
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (
    name: string,
    factory: () => IDeviceHub,
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };
  vi.resetModules();
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

async function prepareMotionNode() {
  // The reset dropped the wired host, and the fresh modules below read `Dimensions` through it
  await import('../../../vitest.rn-host.setup');
  // Device events ride RN's own emitter through the host, which no callable module registers here
  deviceHub = (await import('./react-native-host')).DeviceEventEmitter;
  const registry = await import('./style-registry');
  const subscriptions = await import('./style-registry/media-subscriptions');
  const accessibility = await import('./media-accessibility');
  const { createElement, routeProp } = await import('./node');
  const { getPublishedStyle } = await import('./node-style');
  registry.registerRules(
    [
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 4 },
      },
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 1,
        style: { padding: 8 },
        cond: 0,
      },
    ],
    [['=', 'prefers-reduced-motion', 'reduce']],
  );
  subscriptions.setMediaAccessibilityStarter(
    accessibility.startMediaAccessibility,
  );
  // Mounted synchronously, so no microtask runs before the first assertion
  return () => {
    const node = createElement('RCTView');
    routeProp(node, 'class', 'card');
    return { styleOf: () => getPublishedStyle(node)[0] };
  };
}

describe('prefers-reduced-motion from the accessibility module', () => {
  it('starts at no-preference and flips once the read lands', async () => {
    const mount = await prepareMotionNode();
    const { styleOf } = mount();
    expect(styleOf()).toEqual({ padding: 4 });

    await Promise.resolve();
    expect(styleOf()).toEqual({ padding: 8 });
  });

  it('is wired by creating a surface, with no registration by hand', async () => {
    await import('../../../vitest.rn-host.setup');
    const registry = await import('./style-registry');
    const { createSurface } = await import('./surface');
    const { createElement, routeProp } = await import('./node');
    const { getPublishedStyle } = await import('./node-style');
    registry.registerRules(
      [
        {
          tokens: ['card'],
          specificity: [0, 1, 0],
          order: 0,
          style: { padding: 4 },
        },
        {
          tokens: ['card'],
          specificity: [0, 1, 0],
          order: 1,
          style: { padding: 8 },
          cond: 0,
        },
      ],
      [['=', 'prefers-reduced-motion', 'reduce']],
    );
    const { installRecordingFabric } =
      await import('@symbiote-native/test-utils');
    installRecordingFabric();
    createSurface(8_400);
    const node = createElement('RCTView');
    routeProp(node, 'class', 'card');
    await Promise.resolve();
    expect(getPublishedStyle(node)[0]).toEqual({ padding: 8 });
  });

  it('flips back when the user turns the setting off', async () => {
    const mount = await prepareMotionNode();
    const { styleOf } = mount();
    await Promise.resolve();

    deviceHub?.emit('reduceMotionChanged', false);
    expect(styleOf()).toEqual({ padding: 4 });
  });
});
