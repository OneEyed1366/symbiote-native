// A NATIVE Animated.event on a plain tag, through the Svelte lifecycle, against the REAL committed
// Fabric tag — replaces adapters/svelte/src/modules/animated/animated-native-event.test.ts's
// `installFabric()` half. `addAnimatedEventToView` is asserted against the view's real tag, and the
// driver reads `getNativeTag(node)`, binding nothing and never retrying when it finds none — the
// recording host hands back the same `NO_TAG` sentinel for every node, so that comparison would
// collapse to two sentinels and prove nothing.
//
// The probe uses the RAW bag spelling `<view p={{ onScroll, ... }}>`, not `<view {onScroll}>` —
// Svelte wraps an event-shaped prop in its own closure before any of our code runs, and
// `bindAnimatedEvent` identity-checks for a native `AnimatedEvent`, so a Svelte-wrapped handler can
// never reach it. Same fixture shape the original vitest test used, for the same reason.

import { AnimatedValue, event as animatedEvent } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/svelte';

import {
  describe,
  expect,
  findByTestId,
  flushTimers,
  it,
  report,
} from './harness';
// esbuild resolves this through the `.svelte` loader in `scripts/run-itests.mjs`.
import EventProbe from './svelte-animated-native-event-probe.svelte';

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
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
  disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
  restoreDefaultValues: record('restoreDefaultValues'),
  dropAnimatedNode: record('dropAnimatedNode'),
  startAnimatingNode: record('startAnimatingNode'),
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
const PROBE_ID = 'animated-event-box';

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

describe('Svelte Animated native event on the real engine', () => {
  // why: proves attachNativeEventHandler's post-commit retry actually matters here — under
  // Svelte's async-batched commit the reconcile $effect can run before completeRoot assigns the
  // view its Fabric tag, so a naive same-tick attach would silently bind nothing.
  it('binds a native Animated.event to the committed view tag', async () => {
    const scrollY = new AnimatedValue(0);

    const surface = mount(ROOT_TAG, EventProbe, {
      style: { height: 10 },
      onScroll: animatedEvent(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: true },
      ),
    });
    await tick();
    surface.commit();
    await tick();

    const attach = callsOf('addAnimatedEventToView');
    expect(attach.length).toBe(1);
    expect(attach[0].args[0]).toBe(findByTestId(PROBE_ID)?.tag);
    expect(attach[0].args[1]).toBe('onScroll');
    unmount(ROOT_TAG);
  });
});

report();
