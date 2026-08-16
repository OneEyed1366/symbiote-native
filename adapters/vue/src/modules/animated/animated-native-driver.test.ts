// Co-located Vue-driven test, the Vue twin of
// adapters/react/src/animated/animated-native-driver.test.tsx. Proves the Animated NATIVE driver
// wiring through the VUE lifecycle: a fake NativeAnimatedTurboModule records every call,
// so we assert (no simulator) that `useNativeDriver:true` mirrors the value graph into native,
// wires it, binds the props node to the committed view's Fabric tag (connectAnimatedNodeToView),
// hands the curve to native, keeps the JS view frozen while native drives, and syncs the JS value
// back on completion. The reference is the vue-tsx canary's perpetual native pulse, which renders
// static when this wiring is missing. Vue reactivity + onMounted are async, so mounting is followed
// by a macrotask `tick` before the native-driven animation starts.

import { defineComponent, h, onMounted } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Animated } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

interface INativeCall {
  method: string;
  args: unknown[];
}
const nativeCalls: INativeCall[] = [];
let lastStartCallback: ((result: { finished: boolean; value?: number }) => void) | null = null;
const createdNodeTags = new Set<number>();

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

function assertNodeExists(tag: unknown, method: string): void {
  if (typeof tag !== 'number' || !createdNodeTags.has(tag)) {
    throw new Error(`${method} referenced animated node ${String(tag)} before createAnimatedNode`);
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
    nativeCalls.push({ method: 'connectAnimatedNodes', args: [parentTag, childTag] });
  },
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  connectAnimatedNodeToView(nodeTag: number, viewTag: number): void {
    assertNodeExists(nodeTag, 'connectAnimatedNodeToView');
    nativeCalls.push({ method: 'connectAnimatedNodeToView', args: [nodeTag, viewTag] });
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
    nativeCalls.push({ method: 'startAnimatingNode', args: [animationId, nodeTag, config] });
    lastStartCallback = endCallback;
  },
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
const ROOT_TAG = 47;

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function appView(): IFakeNode {
  return fabric.appRoot().children[0];
}

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

function configType(config: unknown): unknown {
  return typeof config === 'object' && config !== null && 'type' in config
    ? config.type
    : undefined;
}

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
  createdNodeTags.clear();
  lastStartCallback = null;
});
afterEach(() => unmount(ROOT_TAG));

// Scope: the Vue-specific lifecycle seam only (mount timing, onMounted/commit race,
// createAnimatedComponent's post-commit reconcile). The value-graph/native-driver logic itself
// (node creation, easing, mock swap) is framework-agnostic engine code with its own coverage in
// core/engine/src/animated/*.test.ts — not re-proven here.
//
// No Negative group: this is an integration/wiring proof over an app-authored value graph, not a
// validating function with a throwing/rejecting contract — there is no invalid input this seam
// rejects.
describe('Vue Animated native driver', () => {
  describe('Positive (native driver wiring through Vue lifecycle)', () => {
    // why: proves the ordinary (non-racing) path end to end — value graph mirrored into native,
    // props node bound to the already-committed view, and the JS value synced back on completion.
    // Animation starts AFTER `tick()`, so the Fabric tag already exists here; this is the baseline
    // the racing test below is contrasted against.
    it('mirrors the value graph into native and binds it to the committed view', async () => {
      const opacity = new Animated.Value(0);
      const slide = opacity.interpolate({ inputRange: [0, 1], outputRange: [0, 100] });

      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Animated.View, { style: { opacity, transform: [{ translateX: slide }] } }),
        }),
      );
      await tick();
      const viewTag = appView().tag;

      let finished = false;
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start(
        result => {
          finished = result.finished;
        },
      );

      const created = callsOf('createAnimatedNode');
      const createdTypes = created.map(call => configType(call.args[1]));
      expect(createdTypes).toEqual(expect.arrayContaining(['value', 'style', 'props']));

      expect(callsOf('connectAnimatedNodes').length).toBeGreaterThanOrEqual(2);

      const connectView = callsOf('connectAnimatedNodeToView');
      expect(connectView).toHaveLength(1);
      expect(connectView[0].args[1]).toBe(viewTag);

      const valueCreate = created.find(call => configType(call.args[1]) === 'value');
      const valueTag = valueCreate?.args[0];
      const start = callsOf('startAnimatingNode');
      expect(start).toHaveLength(1);
      expect(start[0].args[1]).toBe(valueTag);
      expect(configType(start[0].args[2])).toBe('frames');

      expect(appView().props.opacity).toBe(0);

      const notifyComplete = lastStartCallback;
      expect(notifyComplete).not.toBeNull();
      notifyComplete?.({ finished: true, value: 1 });
      await tick();

      expect(finished).toBe(true);
      expect(appView().props.opacity).toBe(1);
    });

    // why: this is the actual Gotcha-2 race, not a simulation of it. The component's OWN onMounted
    // (not the test's `await tick()`) starts the native animation synchronously, inside the same
    // mount() call that queued (but has not yet run) the requestCommit microtask — so the Fabric
    // tag genuinely does not exist yet when the leaf goes native and tries to bind. Removing the
    // whenCommitted retry from connectAnimatedNodeToView's caller would make this test fail
    // (0 connects), which the first test above cannot catch since it starts the animation only
    // after the commit has already landed. The exact shape (ARRAY style, two interpolations off one
    // value, a perpetual Animated.loop) is the canary pulse that rendered static in production
    // before the retry existed.
    it('binds a looping native pulse declared with an array style + onMounted start', async () => {
      const pulse = new Animated.Value(0);
      const pulseScale = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.3, 1] });
      const pulseOpacity = pulse.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.4, 1, 0.4],
      });

      mount(
        ROOT_TAG,
        defineComponent({
          setup() {
            const loop = Animated.loop(
              Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
            );
            onMounted(() => loop.start());
            return () =>
              h(Animated.View, {
                style: [
                  { width: 64, height: 64 },
                  { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
                ],
              });
          },
        }),
      );
      await tick();
      const viewTag = appView().tag;

      const createdTypes = callsOf('createAnimatedNode').map(call => configType(call.args[1]));
      expect(createdTypes).toEqual(expect.arrayContaining(['value', 'style', 'props']));

      const connectView = callsOf('connectAnimatedNodeToView');
      expect(connectView).toHaveLength(1);
      expect(connectView[0].args[1]).toBe(viewTag);

      expect(callsOf('startAnimatingNode')).toHaveLength(1);
    });
  });
});
