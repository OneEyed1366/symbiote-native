// The NATIVE half of Solid's Animated wrap: a fake NativeAnimatedTurboModule on the JSI module
// proxy records every call, so we assert without a simulator that `useNativeDriver: true` mirrors
// the value graph into native and binds the props leaf to the committed view's Fabric tag.
//
// The Solid-specific stake is the LAST test. This adapter commits through `requestCommit()`, which
// is microtask-coalesced, so the mount-time effect that reconciles the leaf runs BEFORE the node
// has a tag. Without the `whenCommitted` retry the wrap passes as `scheduleNativeBind`, the native
// half no-ops with no second chance and every animation is silently JS-driven on device while
// every other assertion here still passes.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
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

function runFrames(count: number): void {
  for (let index = 0; index < count; index += 1) frameQueue.shift()?.();
}

const ROOT_TAG = 617;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

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
    mount(ROOT_TAG, () => <Animated.View style={{ opacity }} />);
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

  it('binds the props leaf to the committed view tag', async () => {
    const opacity = new Animated.Value(0);
    mount(ROOT_TAG, () => <Animated.View style={{ opacity }} />);
    await tick();

    Animated.timing(opacity, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();
    await tick();

    const connects = callsOf('connectAnimatedNodeToView');
    expect(connects.length).toBeGreaterThan(0);
    // The SECOND argument is the Fabric tag. A leaf connected to nothing animates nothing, and
    // this is the assertion that fails when the mount-time effect wins the race with the commit.
    const viewTag = connects[0].args[1];
    expect(viewTag).toBe(fabric.appRoot().children[0].tag);
  });
  it('binds a leaf that must go native BEFORE the first commit', async () => {
    // The sticky-header shape: the passthrough makes wantsNative true on the FIRST reconcile,
    // which a Solid effect runs while the node still has no Fabric tag (requestCommit() is
    // microtask-coalesced).
    //
    // HONEST LIMIT — this does NOT pin the wrap's `scheduleNativeBind`. Deleting that argument
    // leaves all seven tests green, because the engine parks the leaf in pendingViewConnects and
    // its own registerPostCommit hook (animated/props.ts) reconnects it. The deferral stays anyway:
    // that hook is a module-load side effect, and the shape it guards was earned on a device, not
    // inferred from a suite. What this test DOES pin is that a leaf needing native promotion at
    // mount ends up connected to the real tag by SOME route.
    const translateY = new Animated.Value(0);
    mount(ROOT_TAG, () => (
      <Animated.View
        style={{ transform: [{ translateY }] }}
        passthroughAnimatedPropExplicitValues={{
          style: { transform: [{ translateY: 0 }] },
        }}
      />
    ));
    await tick();

    const connects = callsOf('connectAnimatedNodeToView');
    expect(connects.length).toBeGreaterThan(0);
    expect(connects[0].args[1]).toBe(fabric.appRoot().children[0].tag);
  });
  // ---- native vs JS, same component, one flag apart -----------------------
  //
  // "It looks smooth" proves nothing on this adapter: Solid updates a leaf through setNativeProps
  // without touching its reactive graph, so a JS-driven animation is fast enough to pass the eye.
  // The discriminator is not smoothness — it is whether JS participates AT ALL. Under the native
  // driver the curve lives on the UI thread: no frame callback is ever scheduled and no commit
  // happens. The pair below is the same component and the same value, differing only in the flag,
  // so a silent fallback to JS fails the first test and the second proves the probe can see frames
  // when they exist.

  it('schedules NO js frame and NO commit while the native driver runs', async () => {
    const opacity = new Animated.Value(0);
    mount(ROOT_TAG, () => <Animated.View style={{ opacity }} />);
    await tick();

    frameQueue.length = 0;
    const commitsBefore = fabric.counts.completeRoot;

    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
    await tick();

    // A JS-driven run schedules its first rAF synchronously inside start(). Zero here is the whole
    // claim: the curve left the JS thread.
    expect(frameQueue.length).toBe(0);
    expect(fabric.counts.completeRoot).toBe(commitsBefore);
    // ...and it left it by the native route, not by failing to start.
    expect(callsOf('startAnimatingNode').length).toBe(1);
  });

  it('control: the SAME animation on the js driver does schedule frames and commit', async () => {
    const opacity = new Animated.Value(0);
    mount(ROOT_TAG, () => <Animated.View style={{ opacity }} />);
    await tick();

    frameQueue.length = 0;
    const commitsBefore = fabric.counts.completeRoot;

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
    expect(fabric.counts.completeRoot).toBeGreaterThan(commitsBefore);
    expect(callsOf('startAnimatingNode').length).toBe(0);
  });
});
