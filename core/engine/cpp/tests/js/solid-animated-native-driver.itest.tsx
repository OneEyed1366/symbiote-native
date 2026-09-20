// The two cases split out of adapters/solid/src/modules/animated/animated-native-driver.test.tsx:
// both compare a native call's view-tag argument against the committed Fabric tag, which a
// recording host cannot answer honestly (both sides would read the same `NO_TAG` sentinel).
//
// The Solid-specific stake is the second case: this adapter commits through `requestCommit()`,
// which is microtask-coalesced, so the mount-time effect that reconciles the animated leaf runs
// BEFORE the node has a REAL tag. Without the `whenCommitted` retry the wrap passes as
// `scheduleNativeBind`, the native half no-ops with no second chance, and every animation is
// silently JS-driven on device while every other assertion still passes — which is exactly the
// silent failure a fake tag could never catch, since it never has a real "before the tag exists"
// state to race against.

import { Animated, mount, unmount } from '@symbiote-native/solid';

import {
  describe,
  expect,
  findByTestId,
  flushTimers,
  it,
  report,
} from './harness';

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

const ROOT_TAG = 1;
const PROBE_ID = 'animated-view';

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

describe('Solid Animated native driver on the real engine', () => {
  it('binds the props leaf to the committed view tag', async () => {
    const opacity = new Animated.Value(0);
    const surface = mount(ROOT_TAG, () => (
      <view testID={PROBE_ID} style={{ opacity }} />
    ));
    surface.commit();
    await tick();

    Animated.timing(opacity, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();
    await tick();
    surface.commit();

    const connects = callsOf('connectAnimatedNodeToView');
    expect(connects.length > 0).toBe(true);
    // The SECOND argument is the Fabric tag. A leaf connected to nothing animates nothing, and
    // this is the assertion that fails when the mount-time effect wins the race with the commit.
    const viewTag = connects[0].args[1];
    expect(viewTag).toBe(findByTestId(PROBE_ID)?.tag);
    unmount(ROOT_TAG);
  });

  it('binds a leaf that must go native BEFORE the first commit', async () => {
    // The sticky-header shape: the prop write that binds the leaf happens while the node still has
    // no Fabric tag, because this adapter commits through `requestCommit()` and that is
    // microtask-coalesced. Promotion is by CASCADE from `useNativeDriver`, never from a prop.
    //
    // What this pins is that a leaf bound before the commit ends up connected to the REAL tag: the
    // engine parks it in pendingViewConnects and its own registerPostCommit hook
    // (animated/props.ts) reconnects it once the tag exists. Against the real engine this is
    // genuinely TWO connect calls — an early one against a placeholder tag that never lands in the
    // committed tree, then the postCommit reconnect against the real one — where the retired mirror
    // committed synchronously and so only ever produced one. The claim is "ends up connected", so
    // the assertion reads the LAST call, not the first.
    const translateY = new Animated.Value(0);
    const surface = mount(ROOT_TAG, () => (
      <view testID={PROBE_ID} style={{ transform: [{ translateY }] }} />
    ));
    Animated.timing(translateY, {
      toValue: 40,
      duration: 10,
      useNativeDriver: true,
    }).start();
    await tick();
    surface.commit();
    await tick();

    const connects = callsOf('connectAnimatedNodeToView');
    expect(connects.length > 0).toBe(true);
    expect(connects.at(-1)?.args[1]).toBe(findByTestId(PROBE_ID)?.tag);
    unmount(ROOT_TAG);
  });
});

report();
