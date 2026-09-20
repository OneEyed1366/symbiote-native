// A NATIVE Animated.event on an Animated component, through the Vue lifecycle, against the REAL
// committed Fabric tag — replaces adapters/vue/src/modules/animated/animated-native-event.test.ts's
// `installFabric()` half. `addAnimatedEventToView`'s first arg is asserted against the view's real
// committed Fabric tag; the recording host hands back the same `NO_TAG` sentinel for every node, so
// that comparison would collapse to two sentinels and prove nothing.

import {
  Animated,
  defineComponent,
  h,
  mount,
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
const PROBE_ID = 'animated-event-view';

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

describe('Vue Animated component native event on the real engine', () => {
  // why: this is the actual Gotcha-2 race, not a simulation of it. createAnimatedComponent's own
  // onMounted -> reconcile -> attachEvents runs synchronously inside Vue's mount() call, before the
  // requestCommit microtask that assigns the view's Fabric tag has run — so
  // attachNativeEventHandler is first invoked with no tag. Without the whenCommitted retry, this
  // would leave `addAnimatedEventToView` never called.
  it('binds a native Animated.event to the committed view tag', async () => {
    const scrollY = new Animated.Value(0);
    const surface = mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Animated.View, {
            testID: PROBE_ID,
            style: { height: 10 },
            onScroll: Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true },
            ),
          }),
      }),
    );
    await tick();
    surface.commit();
    await tick();

    const view = findByTestId(PROBE_ID);
    expect(view !== undefined).toBe(true);
    if (view === undefined)
      throw new Error('unreachable: animated view missing');

    const attach = callsOf('addAnimatedEventToView');
    expect(attach.length > 0).toBe(true);
    expect(attach.at(-1)?.args[0]).toBe(view.tag);
    expect(attach.at(-1)?.args[1]).toBe('onScroll');
    unmount(ROOT_TAG);
  });
});

report();
