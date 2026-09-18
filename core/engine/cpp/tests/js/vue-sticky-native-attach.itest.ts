// Sticky-header NATIVE scroll attach, through a real Vue mount, against the REAL committed Fabric
// tag — replaces adapters/vue/src/components/scroll-view/sticky-native-attach.test.ts's
// `installFabric()` half. The claim is specifically that the native bind reaches the REAL committed
// tag; the recording host hands back the same `NO_TAG` sentinel for every node, so that comparison
// would collapse to two sentinels and prove nothing.
//
// `attachStickyScroll` -> `attachNativeEvent` calls the engine's own `whenCommitted` internally
// (core/engine/src/animated/event.ts), so every adapter gets the deferred retry for free. What this
// proves is that Vue's real async-batched commit still resolves through that shared mechanism.

import { defineComponent, h, mount, unmount } from '@symbiote-native/vue';

import {
  describe,
  expect,
  findCommitted,
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

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

function mountStickyScrollView(): ReturnType<typeof mount> {
  return mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h('scroll-view', { stickyHeaderIndices: [0] }, [
          h('view', { key: 'header', style: { height: 20 } }),
          h('view', { key: 'row', style: { height: 20 } }),
        ]),
    }),
  );
}

describe('Vue <scroll-view> sticky native scroll attach on the real engine', () => {
  it('does not bind synchronously, before the scroll view has a committed Fabric tag', () => {
    // why: proves the retry is load-bearing on Vue's real commit timing, not incidental — the tag
    // element's node exists during Vue's own patch (synchronous), but the commit that assigns the
    // Fabric tag is a queued microtask. A naive attach reading getNativeTag() at this point would
    // see undefined and bind nothing.
    const surface = mountStickyScrollView();
    surface.commit();

    expect(callsOf('addAnimatedEventToView').length).toBe(0);
    unmount(ROOT_TAG);
  });

  it('binds the scroll event to the committed scroll view tag once the retry runs after commit', async () => {
    // why: the actual regression this file guards — sticky headers must survive Vue's
    // async-batched commit via the engine's own deferred retry (React needs no retry, its commit
    // is synchronous).
    const surface = mountStickyScrollView();
    await tick();
    surface.commit();
    await tick();

    // The committed tree's own name for this view is the SHORT form ("ScrollView"), not the native
    // class ("RCTScrollView") `installFabric()`'s mirror reported.
    const scrollView = findCommitted(n => n.viewName === 'ScrollView');
    expect(scrollView !== undefined).toBe(true);
    if (scrollView === undefined)
      throw new Error('unreachable: RCTScrollView missing');

    const attach = callsOf('addAnimatedEventToView');
    expect(attach.length).toBe(1);
    expect(attach[0].args[0]).toBe(scrollView.tag);
    expect(attach[0].args[1]).toBe('onScroll');
    unmount(ROOT_TAG);
  });
});

report();
