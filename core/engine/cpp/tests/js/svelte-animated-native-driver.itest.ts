// The Animated NATIVE driver wiring through the Svelte lifecycle, against the REAL committed
// Fabric tag — replaces adapters/svelte/src/modules/animated/animated-native-driver.test.ts's
// `installFabric()` half. `connectAnimatedNodeToView` is asserted against the view's real tag, and
// the native driver reads `getNativeTag(node)`, binding nothing and never retrying when it finds
// none — the recording host hands back the same `NO_TAG` sentinel for every node, so that
// comparison would collapse to two sentinels and prove nothing (mirror-elimination.md, "A tag
// comparison whose two sides are both NO_TAG sentinels proves nothing").
//
// The probe is a real `.svelte` file (esbuild's own loader), not a string compiled and
// dynamic-imported at test time — same reason `svelte-host-instance.itest.ts` made the same swap:
// no filesystem to write to and no module loader to import with inside the itest JSI runtime.

import { AnimatedValue, timing } from '@symbiote-native/engine';
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
import DriverProbe from './svelte-animated-native-driver-probe.svelte';

interface INativeCall {
  method: string;
  args: unknown[];
}
const nativeCalls: INativeCall[] = [];
let lastStartCallback:
  ((result: { finished: boolean; value?: number }) => void) | null = null;
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
const PROBE_ID = 'animated-driver-box';

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

function configType(config: unknown): unknown {
  return typeof config === 'object' && config !== null && 'type' in config
    ? config.type
    : undefined;
}

describe('Svelte Animated native driver on the real engine', () => {
  it('mirrors the value graph into native and binds it to the committed view', async () => {
    const opacity = new AnimatedValue(0);
    const slide = opacity.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
    });

    const surface = mount(ROOT_TAG, DriverProbe, {
      style: { opacity, transform: [{ translateX: slide }] },
    });
    await tick();
    surface.commit();
    await tick();

    const view = findByTestId(PROBE_ID);
    expect(view !== undefined).toBe(true);
    if (view === undefined)
      throw new Error('unreachable: animated view missing');
    const viewTag = view.tag;

    let finished = false;
    timing(opacity, {
      toValue: 0.5,
      duration: 200,
      useNativeDriver: true,
    }).start(result => {
      finished = result.finished;
    });

    const created = callsOf('createAnimatedNode');
    const createdTypes = created.map(call => configType(call.args[1]));
    expect(createdTypes.includes('value')).toBe(true);
    expect(createdTypes.includes('style')).toBe(true);
    expect(createdTypes.includes('props')).toBe(true);

    expect(callsOf('connectAnimatedNodes').length > 1).toBe(true);

    const connectView = callsOf('connectAnimatedNodeToView');
    expect(connectView.length).toBe(1);
    expect(connectView[0].args[1]).toBe(viewTag);

    const valueCreate = created.find(
      call => configType(call.args[1]) === 'value',
    );
    const valueTag = valueCreate?.args[0];
    const start = callsOf('startAnimatingNode');
    expect(start.length).toBe(1);
    expect(start[0].args[1]).toBe(valueTag);
    expect(configType(start[0].args[2])).toBe('frames');

    expect(findByTestId(PROBE_ID)?.props.opacity).toBe('0');

    const notifyComplete = lastStartCallback;
    expect(notifyComplete !== null).toBe(true);
    notifyComplete?.({ finished: true, value: 0.5 });
    await tick();
    surface.commit();

    expect(finished).toBe(true);
    expect(findByTestId(PROBE_ID)?.props.opacity).toBe('0.5');
    unmount(ROOT_TAG);
  });
});

report();
