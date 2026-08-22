// Regression for the ref-ordering bug fixed 2026-08-21. ScrollView handed its imperative handle
// to `local.ref(handle)` before `buildTree()` assigned `scrollNode`. `createAnimatedComponent`'s
// resolveHostNode reads handle.getScrollNode() eagerly, once, at ref-call time instead of
// re-reading the handle's own lazy getter later, so it captured a permanently-null node.
//
// Animated.ScrollView's onScroll then never native-attached: a scroll-linked header fade
// (CanaryScreen's "HEADER - fades as you scroll" bar) froze at its initial value, on Solid only.
// React's useImperativeHandle and Vue's expose() fire the ref only after the child's own mount
// work, so they never saw a null handle.
//
// Same fake-native-module pattern as animated-native-driver.test.tsx: a fake
// NativeAnimatedTurboModule records every call, so "did the native attach happen" is a direct
// observation instead of an inference from smoothness.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import { Animated } from '../../modules/animated';

interface INativeCall {
  method: string;
  args: unknown[];
}
const nativeCalls: INativeCall[] = [];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

const fakeNativeAnimated = {
  createAnimatedNode: record('createAnimatedNode'),
  connectAnimatedNodes: record('connectAnimatedNodes'),
  connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
  startAnimatingNode: record('startAnimatingNode'),
  stopAnimation: record('stopAnimation'),
  setAnimatedNodeValue: record('setAnimatedNodeValue'),
  setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
  flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
  extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
  restoreDefaultValues: record('restoreDefaultValues'),
  dropAnimatedNode: record('dropAnimatedNode'),
  startListeningToAnimatedNodeValue: record(
    'startListeningToAnimatedNodeValue',
  ),
  stopListeningToAnimatedNodeValue: record('stopListeningToAnimatedNodeValue'),
  getValue: record('getValue'),
  addAnimatedEventToView: record('addAnimatedEventToView'),
  removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
};
Object.assign(globalThis, {
  nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
});

const ROOT_TAG = 619;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

describe('Solid Animated.ScrollView native onScroll attach', () => {
  it('native-attaches onScroll to the committed scroll node', async () => {
    const scrollY = new Animated.Value(0);
    mount(ROOT_TAG, () => (
      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
      >
        <Animated.View style={{ opacity: 1 }} />
      </Animated.ScrollView>
    ));
    await tick();

    // Without the ref-ordering fix, resolveHostNode captures a permanently-null scroll node and
    // this never fires: the event stays attached to nothing, so the view tag never appears.
    const attaches = callsOf('addAnimatedEventToView');
    expect(attaches.length).toBeGreaterThan(0);
    expect(typeof attaches[0].args[0]).toBe('number');
  });
});
