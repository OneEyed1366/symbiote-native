// Co-located Vue-driven test: sticky-header NATIVE scroll attach, through a real Vue mount.
//
// The retry-past-async-commit mechanism used to live in this adapter's own
// `watch(() => nodeRef.value, …, {flush:'post'})` (Vue's twin of React's `useEffect`). It is gone
// with the wrapper: `<scroll-view>` is a tag now, and `attachStickyScroll` ->
// `attachNativeEvent` calls the engine's own `whenCommitted` internally
// (`core/engine/src/animated/event.ts`), so every adapter gets the deferred retry for free and
// none of them has to build it. What is left to prove here is that Vue's real async-batched
// commit still resolves through that shared mechanism — the device risk `vue-adapter-reactivity`
// names (a NATIVE-driven feature that works on React but is frozen on an adapter whose commit is
// a tick later, with the headless JS-path smoke green regardless).
//
// The fake NativeAnimatedTurboModule records the bind so we assert it happened against the real
// committed tag, no simulator.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

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

const fabric = installFabric();
const ROOT_TAG = 51;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

function scrollViewNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  if (node === undefined) throw new Error('RCTScrollView was not created');
  return node;
}

function mountStickyScrollView(): void {
  mount(
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

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('Vue <scroll-view> sticky native scroll attach', () => {
  describe('Positive (the native bind reaches the committed scroll view, deferred until commit)', () => {
    it('does not bind synchronously, before the scroll view has a committed Fabric tag', () => {
      // why: proves the retry is load-bearing on Vue's real commit timing, not incidental — the
      // tag element's node exists during Vue's own patch (synchronous), but the commit that
      // assigns the Fabric tag is a queued microtask. A naive attach reading getNativeTag() at
      // this point would see undefined and bind nothing.
      mountStickyScrollView();

      expect(
        callsOf('addAnimatedEventToView'),
        'no bind before the commit microtask runs',
      ).toHaveLength(0);
    });

    it('binds the scroll event to the committed scroll view tag once the retry runs after commit', async () => {
      // why: the actual regression this file guards — sticky headers must survive Vue's
      // async-batched commit via the engine's own deferred retry (React needs no retry, its
      // commit is synchronous).
      mountStickyScrollView();
      await tick();

      const attach = callsOf('addAnimatedEventToView');
      expect(
        attach,
        'sticky scroll attaches an Animated.event to the native view',
      ).toHaveLength(1);
      expect(attach[0].args[0], 'bound to the committed scroll view tag').toBe(
        scrollViewNode().tag,
      );
      expect(attach[0].args[1]).toBe('onScroll');
    });
  });
});
