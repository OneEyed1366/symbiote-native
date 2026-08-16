// Co-located, real-compiled-source test, the Svelte twin of
// adapters/vue/src/modules/animated/animated-native-event.test.ts. Proves a NATIVE
// Animated.event on an Animated component: when a prop like
// onScroll={Animated.event([…], {useNativeDriver:true})} rides Animated.View, the wrapper
// attaches it to the committed view on the UI thread (addAnimatedEventToView). The attach runs
// inside the reconcile $effect; under Svelte's async-batched commit the view has no Fabric tag
// yet at the FIRST effect run, so a naive attachNativeEventHandler call would read
// getNativeTag()===undefined and bind nothing with no retry — attachNativeEventHandler's own
// whenCommitted defer (core/engine/src/animated/event.ts) is what makes this actually land. The
// fake NativeAnimatedTurboModule records the bind so we assert it landed against the real tag,
// no host needed.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { AnimatedValue, event as animatedEvent } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

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
const ROOT_TAG = 91_102;

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// fabric.find() walks the CREATION log, which never reflects a later clone's props
// (svelte-adapter-dom-shim skill §15's documented gotcha) — a live-value assertion must
// instead walk the currently COMMITTED tree, same as activity-indicator.smoke.test.ts's
// findLive. Filtering on viewName==='RCTView' alone is not enough to identify OUR node:
// root-element.ts's own mount target is ITSELF an unlabeled `symbiote-view` (RCTView, {}
// props), sitting between the AppContainer and AnimatedView's real host node — so the search
// must key on a prop only our own AnimatedView carries (testID), not the generic viewName.
function findLive(node: IFakeNode, predicate: (n: IFakeNode) => boolean): IFakeNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findLive(child, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

function animatedViewNode(): IFakeNode {
  const node = findLive(fabric.appRoot(), n => n.props.testID === 'animated-event-box');
  if (node === undefined) throw new Error('no node with testID="animated-event-box" committed');
  return node;
}

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
} as const;
const VIEW_OUT = join(__dirname, '.smoke-compiled-animated-view-event.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-event-parent.mjs');

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

async function loadParent(): Promise<Component> {
  const viewSource = readFileSync(join(__dirname, 'AnimatedView.svelte'), 'utf8');
  compileToFile(viewSource, 'AnimatedView.svelte', VIEW_OUT);

  compileToFile(
    `<script>
       import AnimatedView from './.smoke-compiled-animated-view-event.mjs';
       let { style, onScroll } = $props();
     </script>
     <AnimatedView {style} {onScroll} testID="animated-event-box" />`,
    'EventParent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('EventParent.svelte produced no default export');
  }
  return mod.default as Component;
}

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(VIEW_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
});

describe('Animated.View (real compiled source) native event', () => {
  it('binds a native Animated.event to the committed view tag', async () => {
    const EventParent = await loadParent();
    const scrollY = new AnimatedValue(0);

    mount(ROOT_TAG, EventParent, {
      style: { height: 10 },
      onScroll: animatedEvent([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    });
    await tick();
    await tick();

    const attach = callsOf('addAnimatedEventToView');
    expect(attach, 'the native event attaches to the view').toHaveLength(1);
    expect(attach[0].args[0], 'bound to the committed view tag').toBe(animatedViewNode().tag);
    expect(attach[0].args[1]).toBe('onScroll');
  });
});
