// Co-located, real-compiled-source test, the Svelte twin of
// adapters/vue/src/modules/animated/animated-native-driver.test.ts. Proves the Animated NATIVE
// driver wiring through the SVELTE lifecycle: a fake NativeAnimatedTurboModule records every
// call, so we assert (no simulator) that `useNativeDriver:true` mirrors the value graph into
// native, wires it, binds the props node to the committed view's Fabric tag
// (connectAnimatedNodeToView), hands the curve to native, and keeps the JS-committed prop frozen
// while native drives.
//
// Compiles the REAL AnimatedView.svelte (not a hand-written stand-in) through svelte/compiler,
// same pattern as components/switch/switch.smoke.test.ts: write the compiled output CO-LOCATED
// with the real source (its own `import ... from './animated-props-runtime'` / `'../../dom-shim'`
// resolve relative to wherever the compiled file lives), then dynamic-import it.
//
// Scope note: the value graph / interpolation math / native-tag minting this exercises belongs to
// core/engine (already covered by core/engine/src/animated/*.test.ts) and is used, not
// re-verified, here — this file's job is proving the SVELTE side of the wiring: that mounting
// AnimatedView through the real component tree produces a committed Fabric view whose tag is what
// gets bound, at the moment `bind:this`/the reconcile $effect actually run.
//
// No Negative group: there is no invalid input this path rejects — `timing(...).start()` on an
// unmounted-but-committed view is the one supported shape. The counterpart of this scenario (no
// native module installed, so the same style prop drives through the JS-only fallback instead) is
// animated-view.smoke.test.ts, not duplicated here.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { AnimatedValue } from '@symbiote-native/engine';
import { timing } from '@symbiote-native/engine';
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
const ROOT_TAG = 91_101;

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

function appView(): IFakeNode {
  const node = findLive(fabric.appRoot(), n => n.props.testID === 'animated-driver-box');
  if (node === undefined) throw new Error('no node with testID="animated-driver-box" committed');
  return node;
}

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

function configType(config: unknown): unknown {
  return typeof config === 'object' && config !== null && 'type' in config
    ? config.type
    : undefined;
}

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
} as const;
const VIEW_OUT = join(__dirname, '.smoke-compiled-animated-view.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-driver-parent.mjs');

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

async function loadParent(): Promise<Component> {
  const viewSource = readFileSync(join(__dirname, 'AnimatedView.svelte'), 'utf8');
  compileToFile(viewSource, 'AnimatedView.svelte', VIEW_OUT);

  compileToFile(
    `<script>
       import AnimatedView from './.smoke-compiled-animated-view.mjs';
       let { style } = $props();
     </script>
     <AnimatedView {style} testID="animated-driver-box" />`,
    'DriverParent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('DriverParent.svelte produced no default export');
  }
  return mod.default as Component;
}

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
  createdNodeTags.clear();
  lastStartCallback = null;
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(VIEW_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
});

describe('Animated.View (real compiled source) native driver (Positive)', () => {
  // why: a native-driven animation must bind to the SAME Fabric tag the Svelte adapter actually
  // committed, not a tag the test hardcodes — proving the reconcile $effect reads a real,
  // just-mounted host node (svelte-adapter-dom-shim skill §15's `bind:this` timing question) and
  // that the JS-side prop stays frozen at handoff while native owns the frame-by-frame value,
  // syncing back only on completion.
  it('mirrors the value graph into native and binds it to the committed view', async () => {
    const DriverParent = await loadParent();
    const opacity = new AnimatedValue(0);
    const slide = opacity.interpolate({ inputRange: [0, 1], outputRange: [0, 100] });

    mount(ROOT_TAG, DriverParent, {
      style: { opacity, transform: [{ translateX: slide }] },
    });
    await tick();
    await tick();
    const viewTag = appView().tag;

    let finished = false;
    timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start(result => {
      finished = result.finished;
    });

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
});
