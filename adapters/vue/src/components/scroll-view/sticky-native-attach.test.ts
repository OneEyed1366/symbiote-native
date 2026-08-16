// Co-located Vue-driven test: sticky-header NATIVE scroll attach. On a real host the
// scroll offset must be driven on the UI thread so each sticky header's translateY interpolation
// rides scroll natively (RN attachNativeEvent, ScrollView.js). symbiote wires that by attaching an
// Animated.event to the COMMITTED scroll view's Fabric tag (addAnimatedEventToView). Under Vue's
// async-batched commit the scroll view's tag isn't assigned at onMounted/post-flush time, so a naive
// attach reads getNativeTag()===undefined, binds nothing, and the headers never move — the device
// bug this guards (React commits synchronously, so its effect always sees the tag). The fake
// NativeAnimatedTurboModule records the bind so we assert it happened against the real tag, no
// simulator.
//
// Unit under test: the `watch(() => nodeRef.value, …, {flush:'post'})` in
// adapters/vue/src/components/scroll-view/shared.ts, which calls the shared
// `attachStickyScroll`/`attachNativeEvent` (core/engine, built on `whenCommitted`) — see
// `<vue-adapter-reactivity>` Gotcha 2. The scenario below proves the RETRY itself: at the moment
// nodeRef becomes non-null (set synchronously from Vue's own patch, well before the commit
// microtask resolves), the scroll view has no Fabric tag yet, so a naive
// `addAnimatedEventToView(getNativeTag(node), …)` call would bind nothing. Asserting NO bind
// exists synchronously after mount, and exactly one exists — against the real committed tag —
// only after the tick that lets the commit run, proves the bind depends on the deferred retry,
// not on lucky microtask ordering.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, ScrollView, View } from '@symbiote-native/vue';
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
  startListeningToAnimatedNodeValue: record('startListeningToAnimatedNodeValue'),
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

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

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
        h(ScrollView, { stickyHeaderIndices: [0] }, () => [
          h(View, { key: 'header', style: { height: 20 } }),
          h(View, { key: 'row', style: { height: 20 } }),
        ]),
    }),
  );
}

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('Vue ScrollView sticky native scroll attach', () => {
  describe('Positive (the native bind reaches the committed scroll view, deferred until commit)', () => {
    it('does not bind synchronously, before the scroll view has a committed Fabric tag', () => {
      // why: proves the retry path is load-bearing, not incidental — nodeRef is set during Vue's
      // own patch (synchronous), but the commit that assigns the Fabric tag is a queued microtask.
      // A naive attach reading getNativeTag() at this point would see undefined and bind nothing.
      // If this ever starts passing with a bind already present, the sticky attach stopped
      // depending on the deferred retry and this regression guard is no longer proving what it
      // claims to.
      mountStickyScrollView();

      expect(
        callsOf('addAnimatedEventToView'),
        'no bind before the commit microtask runs',
      ).toHaveLength(0);
    });

    it('binds the scroll event to the committed scroll view tag once the retry runs after commit', async () => {
      // why: the actual regression this file guards — sticky headers must survive Vue's
      // async-batched commit via the deferred retry (React needs no retry, its commit is sync).
      mountStickyScrollView();
      await tick();

      const attach = callsOf('addAnimatedEventToView');
      expect(attach, 'sticky scroll attaches an Animated.event to the native view').toHaveLength(1);
      expect(attach[0].args[0], 'bound to the committed scroll view tag').toBe(
        scrollViewNode().tag,
      );
      expect(attach[0].args[1]).toBe('onScroll');
    });
  });
});
