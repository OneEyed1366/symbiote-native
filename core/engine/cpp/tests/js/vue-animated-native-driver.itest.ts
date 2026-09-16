// The Animated NATIVE driver wiring through the Vue lifecycle, against the REAL committed Fabric
// tag — replaces adapters/vue/src/modules/animated/animated-native-driver.test.ts's
// `installFabric()` half. Both cases compare the tag handed to `connectAnimatedNodeToView` against
// the view's real committed Fabric tag; the recording host hands back the same `NO_TAG` sentinel
// for every node, so that comparison would collapse to two sentinels and prove nothing.

import {
  Animated,
  defineComponent,
  h,
  mount,
  onMounted,
  unmount,
} from '@symbiote-native/vue';

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
const PROBE_ID = 'animated-view';

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

describe('Vue Animated native driver on the real engine', () => {
  it('mirrors the value graph into native and binds it to the committed view', async () => {
    const opacity = new Animated.Value(0);
    const slide = opacity.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
    });

    const surface = mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Animated.View, {
            testID: PROBE_ID,
            style: { opacity, transform: [{ translateX: slide }] },
          }),
      }),
    );
    surface.commit();
    await tick();

    const view = findByTestId(PROBE_ID);
    expect(view !== undefined).toBe(true);
    if (view === undefined)
      throw new Error('unreachable: animated view missing');
    const viewTag = view.tag;

    let finished = false;
    Animated.timing(opacity, {
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

  // why: this is the actual Gotcha-2 race, not a simulation of it. The component's OWN onMounted
  // (not the test's `await tick()`) starts the native animation synchronously, inside the same
  // mount() call that queued (but has not yet run) the requestCommit microtask — so the Fabric tag
  // genuinely does not exist yet when the leaf goes native and tries to bind. Removing the
  // whenCommitted retry from connectAnimatedNodeToView's caller would make this test fail (0
  // connects), which the first case above cannot catch since it starts the animation only after the
  // commit has already landed.
  it('binds a looping native pulse declared with an array style + onMounted start', async () => {
    const pulse = new Animated.Value(0);
    const pulseScale = pulse.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [1, 1.3, 1],
    });
    const pulseOpacity = pulse.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.4, 1, 0.4],
    });

    const surface = mount(
      ROOT_TAG,
      defineComponent({
        setup() {
          const loop = Animated.loop(
            Animated.timing(pulse, {
              toValue: 1,
              duration: 1400,
              useNativeDriver: true,
            }),
          );
          onMounted(() => loop.start());
          return () =>
            h(Animated.View, {
              testID: PROBE_ID,
              style: [
                { width: 64, height: 64 },
                { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
              ],
            });
        },
      }),
    );
    await tick();
    surface.commit();
    await tick();

    const view = findByTestId(PROBE_ID);
    expect(view !== undefined).toBe(true);
    if (view === undefined)
      throw new Error('unreachable: animated view missing');

    const createdTypes = callsOf('createAnimatedNode').map(call =>
      configType(call.args[1]),
    );
    expect(createdTypes.includes('value')).toBe(true);
    expect(createdTypes.includes('style')).toBe(true);
    expect(createdTypes.includes('props')).toBe(true);

    // Against the real engine this is genuinely MORE than one attempt: the leaf goes native before
    // its Fabric tag exists, so the first createAnimatedNode/connect/start pass binds to a
    // placeholder that never lands in the committed tree, and the engine's postCommit retry
    // (animated/props.ts) runs the whole native-side setup again once the real tag is known — not
    // just a reconnect of the same node. The retired mirror committed synchronously and so never
    // raced this at all. The claim this test pins is "ends up connected to the REAL tag", so the
    // assertion reads the LAST attempt, not the first.
    const connectView = callsOf('connectAnimatedNodeToView');
    expect(connectView.length > 0).toBe(true);
    expect(connectView.at(-1)?.args[1]).toBe(view.tag);
    expect(callsOf('startAnimatingNode').length > 0).toBe(true);
    unmount(ROOT_TAG);
  });
});

report();
