// Real-compiled-source smoke test for the JS-DRIVEN path (no native module installed): proves
// `Animated.Value`/`interpolate` reactively drives a style prop through the ordinary
// flushValue -> AnimatedProps.update() -> setNativeProps commit path, with no native module and
// no per-frame Svelte re-render — the everyday (non-native-driver) case every Animated consumer
// hits before opting into useNativeDriver. Compiles the REAL AnimatedView.svelte, same harness
// shape as animated-native-driver.test.ts / components/switch/switch.smoke.test.ts.

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

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
} as const;
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

describe('Animated.View (real compiled source) JS-driven path', () => {
  it('paints the initial rasterized value, then re-paints on setValue with no native module', async () => {
    const JsParent = await loadParent();
    const opacity = new AnimatedValue(0.25);

    mount(ROOT_TAG, JsParent, { style: { opacity }, testID: 'animated-box' });
    await tick();
    await tick();

    expect(appView().viewName).toBe('RCTView');
    expect(appView().props.opacity).toBe(0.25);

    opacity.setValue(0.75);
    await tick();

    expect(appView().props.opacity).toBe(0.75);
  });
});
