// The NATIVE half of Solid's Animated wrap: a fake NativeAnimatedTurboModule on the JSI module
// proxy records every call, so we assert without a simulator that `useNativeDriver: true` mirrors
// the value graph into native and that the JS thread stays out of the loop while it runs.
//
// Split from the file this once was: the two cases that compare a native call's view-tag argument
// against the committed Fabric tag moved to `solid-animated-native-driver.itest.tsx` — a recording
// host never speaks to Fabric, so both sides of that comparison would read the same `NO_TAG`
// sentinel and prove nothing. What is left here needs no tag at all.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import { Animated } from './index';

interface INativeCall {
  method: string;
  args: unknown[];
}
const nativeCalls: INativeCall[] = [];
const createdNodeTags = new Set<number>();

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

// Mirrors the native invariant RCTNativeAnimatedNodesManager asserts: a node must exist before
// anything connects to it. Reproduced headlessly so an ordering bug fails here, not as a SIGABRT.
function assertNodeExists(tag: unknown, method: string): void {
  if (typeof tag !== 'number' || !createdNodeTags.has(tag)) {
    throw new Error(
      `${method} referenced animated node ${String(tag)} before createAnimatedNode`,
    );
  }
}

const fakeNativeAnimated = {
  createAnimatedNode(tag: number, config: unknown): void {
    createdNodeTags.add(tag);
    nativeCalls.push({ method: 'createAnimatedNode', args: [tag, config] });
  },
  connectAnimatedNodes(parentTag: number, childTag: number): void {
    assertNodeExists(parentTag, 'connectAnimatedNodes(parent)');
    assertNodeExists(childTag, 'connectAnimatedNodes(child)');
    nativeCalls.push({
      method: 'connectAnimatedNodes',
      args: [parentTag, childTag],
    });
  },
  connectAnimatedNodeToView(nodeTag: number, viewTag: number): void {
    assertNodeExists(nodeTag, 'connectAnimatedNodeToView');
    nativeCalls.push({
      method: 'connectAnimatedNodeToView',
      args: [nodeTag, viewTag],
    });
  },
  startAnimatingNode(
    animationId: number,
    nodeTag: number,
    config: Record<string, unknown>,
  ): void {
    nativeCalls.push({
      method: 'startAnimatingNode',
      args: [animationId, nodeTag, config],
    });
  },
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
  restoreDefaultValues: record('restoreDefaultValues'),
  dropAnimatedNode: record('dropAnimatedNode'),
  stopAnimation: record('stopAnimation'),
  setAnimatedNodeValue: record('setAnimatedNodeValue'),
  setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
  flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
  extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
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

// The JS driver reads requestAnimationFrame off the host at call time (animated/animations/raf.ts),
// so replacing it makes "did the JS thread schedule a frame?" a direct observation rather than an
// inference from timing.
const frameQueue: Array<() => void> = [];
Object.assign(globalThis, {
  requestAnimationFrame(callback: () => void): number {
    frameQueue.push(callback);
    return frameQueue.length;
  },
  cancelAnimationFrame(): void {},
});

// Real elapsed time, not zero: `animations/timing.ts` computes its curve off `Date.now()`, and a
// synchronous frame pump with no clock movement returns the SAME near-t0 value on every call — the
// dedup guard (`node.ts`'s `isAlreadyPublished`) then sees an unchanged write and never republishes
// it, which looks identical to "the JS driver never ran" from the outside.
let fakeNow = Date.now();
Date.now = () => fakeNow;

function runFrames(count: number): void {
  for (let index = 0; index < count; index += 1) {
    fakeNow += 16;
    frameQueue.shift()?.();
  }
}

const ROOT_TAG = 617;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// The node the JS driver would write `opacity` onto, read live (not from the creation record, which
// never reflects a later clone's props).
function liveOpacity(): number | undefined {
  const node = live
    .findAllLive(live.appRoot(), n => Object.hasOwn(n.payload, 'opacity'))
    .at(0);
  return typeof node?.payload.opacity === 'number'
    ? node.payload.opacity
    : undefined;
}

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
  createdNodeTags.clear();
});
afterEach(() => unmount(ROOT_TAG));

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

describe('Solid Animated native driver', () => {
  it('mirrors the value graph into native and hands the curve over', async () => {
    const opacity = new Animated.Value(0);
    mount(ROOT_TAG, () => <view style={{ opacity }} />);
    await tick();

    Animated.timing(opacity, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();
    await tick();

    // The curve left JS. Without this the animation is a rAF loop, which is exactly the silent
    // degradation this file exists to catch.
    expect(callsOf('startAnimatingNode').length).toBeGreaterThan(0);
    expect(callsOf('createAnimatedNode').length).toBeGreaterThan(0);
  });

  // ---- native vs JS, same component, one flag apart -----------------------
  //
  // "It looks smooth" proves nothing on this adapter: Solid updates a leaf through setNativeProps
  // without touching its reactive graph, so a JS-driven animation is fast enough to pass the eye.
  // The discriminator is not smoothness — it is whether JS participates AT ALL. Under the native
  // driver the curve lives on the UI thread: no frame callback is ever scheduled and the live
  // `opacity` on the JS-side node never moves. The pair below is the same component and the same
  // value, differing only in the flag, so a silent fallback to JS fails the first test and the
  // second proves the probe can see the value move when it should.

  it('schedules NO js frame, and the JS-side opacity never moves, while the native driver runs', async () => {
    const opacity = new Animated.Value(0);
    mount(ROOT_TAG, () => <view style={{ opacity }} />);
    await tick();

    frameQueue.length = 0;
    const opacityBefore = liveOpacity();

    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
    await tick();

    // A JS-driven run schedules its first rAF synchronously inside start(). Zero here is the whole
    // claim: the curve left the JS thread.
    expect(frameQueue.length).toBe(0);
    expect(liveOpacity()).toBe(opacityBefore);
    // ...and it left it by the native route, not by failing to start.
    expect(callsOf('startAnimatingNode').length).toBe(1);
  });

  it('control: the SAME animation on the js driver does schedule frames and move the value', async () => {
    const opacity = new Animated.Value(0);
    mount(ROOT_TAG, () => <view style={{ opacity }} />);
    await tick();

    frameQueue.length = 0;
    const opacityBefore = liveOpacity();

    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: false,
    }).start();
    await tick();

    // Without this half the test above would also pass on an animation that never started.
    expect(frameQueue.length).toBeGreaterThan(0);
    runFrames(3);
    await tick();
    expect(liveOpacity()).not.toBe(opacityBefore);
    expect(callsOf('startAnimatingNode').length).toBe(0);
  });
});
