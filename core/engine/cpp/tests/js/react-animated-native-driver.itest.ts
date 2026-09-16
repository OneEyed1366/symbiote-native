// The Animated NATIVE driver wiring against the REAL committed Fabric tag, replacing
// adapters/react/src/modules/animated/animated-native-driver.test.tsx's `installFabric()` half.
//
// Every assertion here except one is pure JS-level behavior against a FAKE `NativeAnimatedTurboModule`
// (the same fake the vitest original used — nothing about it needs real Fabric). The one exception is
// `connectAnimatedNodeToView`'s tag: `useNativeDriver:true` binds the props node to the COMMITTED
// view's real Fabric tag, and the recording host hands back the same `NO_TAG` sentinel for every
// node, so that one comparison would collapse to two sentinels and prove nothing
// (mirror-elimination.md, "A tag comparison whose two sides are both NO_TAG sentinels proves
// nothing"). A real committed tag is the only thing this file needs from the real engine; the fake
// native module travels unchanged.

import { createElement } from 'react';
import { Animated, mount } from '@symbiote-native/react';

import {
  describe,
  expect,
  findByTestId,
  flushTimers,
  it,
  report,
} from './harness';

// ---- fake NativeAnimatedTurboModule (records calls), identical to the vitest original ----------

type INativeCall = { method: string; args: unknown[] };
const nativeCalls: INativeCall[] = [];
let lastStartCallback:
  ((result: { finished: boolean; value?: number }) => void) | null = null;

// Mirror the native invariant that crashed on device: RCTNativeAnimatedNodesManager asserts a node
// exists before connecting it. Reproduce it headlessly so a connect-before-create ordering bug fails
// here instead of as a SIGABRT on iOS.
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
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  connectAnimatedNodeToView(nodeTag: number, viewTag: number): void {
    assertNodeExists(nodeTag, 'connectAnimatedNodeToView');
    nativeCalls.push({
      method: 'connectAnimatedNodeToView',
      args: [nodeTag, viewTag],
    });
  },
  disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
  restoreDefaultValues: record('restoreDefaultValues'),
  dropAnimatedNode: record('dropAnimatedNode'),
  startAnimatingNode(
    animationId: number,
    nodeTag: number,
    config: Record<string, unknown>,
    endCallback: (result: { finished: boolean; value?: number }) => void,
  ): void {
    nativeCalls.push({
      method: 'startAnimatingNode',
      args: [animationId, nodeTag, config],
    });
    lastStartCallback = endCallback;
  },
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

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

function configType(config: unknown): unknown {
  return typeof config === 'object' && config !== null && 'type' in config
    ? config.type
    : undefined;
}

describe('Animated native driver on the real engine', () => {
  it('mirrors the value graph into native, binds to the real committed tag, and syncs the JS value on completion', async () => {
    // A diamond: one value feeds both opacity and a transform, so `style` has two animated parents
    // (opacity-interp and the transform node). This is the shape that crashed on device. It forces
    // the create-vs-connect ordering the fix guarantees.
    const opacity = new Animated.Value(0);
    const slide = opacity.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
    });

    const surface = mount(
      ROOT_TAG,
      createElement(Animated.View, {
        testID: PROBE_ID,
        style: { opacity, transform: [{ translateX: slide }] },
      }),
    );
    flushTimers();
    surface.commit();

    const view = findByTestId(PROBE_ID);
    expect(view !== undefined).toBe(true);
    if (view === undefined)
      throw new Error('unreachable: animated view missing');
    const viewTag = view.tag;

    let finished = false;
    // Not 1: RN's `getDebugProps` omits a field that equals its default (opacity's default IS 1),
    // so a final value of exactly the default would be indistinguishable from "never written" once
    // read back through Fabric's own debug-props selection — a real-engine detail the mirror never
    // had, because the mirror reported whatever value was last written regardless of default.
    Animated.timing(opacity, {
      toValue: 0.5,
      duration: 200,
      useNativeDriver: true,
    }).start(result => {
      finished = result.finished;
    });

    // the graph was mirrored into native: a value, style, and props node each exist
    const created = callsOf('createAnimatedNode');
    const createdTypes = created.map(call => configType(call.args[1]));
    expect(createdTypes.includes('value')).toBe(true);
    expect(createdTypes.includes('style')).toBe(true);
    expect(createdTypes.includes('props')).toBe(true);

    // value -> style -> props were wired
    expect(callsOf('connectAnimatedNodes').length > 1).toBe(true);

    // the props node was bound to the committed view's REAL Fabric tag
    const connectView = callsOf('connectAnimatedNodeToView');
    expect(connectView.length).toBe(1);
    expect(connectView[0].args[1]).toBe(viewTag);

    // the curve was handed to native against the value node's tag, as a frames config
    const valueCreate = created.find(
      call => configType(call.args[1]) === 'value',
    );
    const valueTag = valueCreate?.args[0];
    const start = callsOf('startAnimatingNode');
    expect(start.length).toBe(1);
    expect(start[0].args[1]).toBe(valueTag);
    expect(configType(start[0].args[2])).toBe('frames');

    // native drives the view, so no JS frame touched it yet
    expect(findByTestId(PROBE_ID)?.props.opacity).toBe('0');

    // native reports completion: JS syncs through one scoped commit
    const notifyComplete = lastStartCallback;
    expect(notifyComplete !== null).toBe(true);
    notifyComplete?.({ finished: true, value: 0.5 });

    expect(finished).toBe(true);
    // The JS sync-back rides the coalesced setNativeProps flush (core/engine/src/commit.ts).
    await Promise.resolve();
    surface.commit();
    expect(findByTestId(PROBE_ID)?.props.opacity).toBe('0.5');
  });
});

report();
