// Порт `AnimatedProps-itest`: вью цепляется к узлу на старте и отцепляется на destroy

import { createElement } from 'react';

import { Animated } from '@symbiote-native/react';

import {
  nativeCallCount,
  resetNativeCalls,
  useNativeAnimated,
} from './animated-fixture';
import { createRoot, destroyRoot, render, runTask } from './culling-fixture';
import { beforeEach, expect, it, report, runWorkLoop } from './harness';

useNativeAnimated();

beforeEach(() => createRoot(100, 100));

it('connects and disconnects views', () => {
  const opacity = new Animated.Value(0);
  render(createElement(Animated.View, { style: { opacity } }));
  resetNativeCalls();

  expect(nativeCallCount('connectAnimatedNodeToView')).toBe(0);
  expect(nativeCallCount('disconnectAnimatedNodeFromView')).toBe(0);

  runTask(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 1_000,
      useNativeDriver: true,
    }).start();
  });
  expect(nativeCallCount('connectAnimatedNodeToView')).toBe(1);
  expect(nativeCallCount('disconnectAnimatedNodeFromView')).toBe(0);

  destroyRoot();

  expect(nativeCallCount('connectAnimatedNodeToView')).toBe(1);
  expect(nativeCallCount('disconnectAnimatedNodeFromView')).toBe(1);

  runWorkLoop();
});

report();
