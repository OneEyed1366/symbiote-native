// Real-compiled-source smoke test for the JS-DRIVEN path (no native module installed): proves
// `Animated.Value`/`interpolate` reactively drives a style prop through the ordinary
// flushValue -> AnimatedProps.update() -> setNativeProps commit path, with no native module and
// no per-frame Svelte re-render — the everyday (non-native-driver) case every Animated consumer
// hits before opting into useNativeDriver. Compiles the REAL AnimatedView.svelte, same harness
// shape as animated-native-driver.test.ts / components/switch/switch.smoke.test.ts.
//
// Scope note: flushValue's graph walk and AnimatedProps.update()'s rasterization are core/engine
// (core/engine/src/animated/*.test.ts) and are used, not re-verified, here. This file's job is the
// Svelte-specific claim: that AnimatedView's reconcile $effect binds the leaf to the REAL committed
// host node (not a stand-in), so a plain `setValue()` reaches the actual Fabric-facing props
// without any native module installed. This is the counterpart of animated-native-driver.test.ts —
// same component, no `nativeModuleProxy`, so `wantsNative` never engages.
//
// No Negative group: `AnimatedValue.setValue()` and the reconcile $effect have no rejecting path
// for this shape — every scenario below is a Positive "does the paint land" claim.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { AnimatedValue } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}
// No `nativeModuleProxy.NativeAnimatedTurboModule` installed: isNativeAnimatedAvailable() is
// false throughout, so this exercises the plain JS-driven fallback exclusively.
globalThis.nativeModuleProxy = undefined;

const fabric = installFabric();
const ROOT_TAG = 91_103;
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
  const node = findLive(fabric.appRoot(), n => n.props.testID === 'animated-box');
  if (node === undefined) throw new Error('no node with testID="animated-box" committed');
  return node;
}

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;
const VIEW_OUT = join(__dirname, '.smoke-compiled-animated-view-js.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-js-parent.mjs');

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

async function loadParent(): Promise<Component> {
  const viewSource = readFileSync(join(__dirname, 'AnimatedView.svelte'), 'utf8');
  compileToFile(viewSource, 'AnimatedView.svelte', VIEW_OUT);

  compileToFile(
    `<script>
       import AnimatedView from './.smoke-compiled-animated-view-js.mjs';
       let { style, testID } = $props();
     </script>
     <AnimatedView {style} {testID} />`,
    'JsParent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('JsParent.svelte produced no default export');
  }
  return mod.default as Component;
}

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(VIEW_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
});

describe('Animated.View (real compiled source) JS-driven path (Positive)', () => {
  // why: the FIRST paint must already carry the rasterized value — an AnimatedValue's initial
  // value, not zero/undefined — so a component mounting with a non-default starting value never
  // flashes the wrong opacity before the first animation frame.
  it('paints the initial rasterized value on mount, with no native module', async () => {
    const JsParent = await loadParent();
    const opacity = new AnimatedValue(0.25);

    mount(ROOT_TAG, JsParent, { style: { opacity }, testID: 'animated-box' });
    await tick();
    await tick();

    expect(appView().viewName).toBe('RCTView');
    expect(appView().props.opacity).toBe(0.25);
  });

  // why: this is the everyday (non-native-driver) path every Animated consumer hits before opting
  // into useNativeDriver — a plain setValue() must reach the committed view with no Svelte
  // re-render of the component itself (the value graph's own flushValue -> setNativeProps commit,
  // not a reactive prop change).
  it('re-paints on setValue, with no native module installed', async () => {
    const JsParent = await loadParent();
    const opacity = new AnimatedValue(0.25);

    mount(ROOT_TAG, JsParent, { style: { opacity }, testID: 'animated-box' });
    await tick();
    await tick();

    opacity.setValue(0.75);
    await tick();

    expect(appView().props.opacity).toBe(0.75);
  });
});
