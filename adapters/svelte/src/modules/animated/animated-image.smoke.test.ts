// Real-compiled-source smoke test for Animated.Image: proves it goes through buildImageBag
// (source resolved to the array shape RCTImageView expects, resizeMode/tintColor folded off
// style) rather than forwarding raw props — the exact gap AnimatedImage.svelte's header comment
// warns a hand-authored pass-through bag would create. Also proves the JS-driven animated style
// path (opacity) still lands, keyed the same way as AnimatedView's own JS-driven smoke.
//
// Scope note: buildImageBag's own field mapping (source normalization, resizeMode/tintColor
// resolution) is core/components logic, already covered by image/index.svelte's own tests; this
// file's job is proving AnimatedImage.svelte actually CALLS it with rasterized values, rather than
// hand-rolling a pass-through bag — the exact copy-paste-instead-of-calling bug class the
// svelte-adapter-dom-shim skill's §15/§19 caught on four other components.
//
// No Negative group: AnimatedImage.svelte has no throwing/rejecting path — every prop is optional
// and rides an open `[key: string]: unknown` bag (IAnimatedComponentProps).

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
globalThis.nativeModuleProxy = undefined;

const fabric = installFabric();
const ROOT_TAG = 91_104;
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// fabric.find() walks the CREATION log, which never reflects a later clone's props
// (svelte-adapter-dom-shim skill §15's documented gotcha) — a live-value assertion must
// instead walk the currently COMMITTED tree, same as activity-indicator.smoke.test.ts's
// findLive.
function findLive(node: IFakeNode, predicate: (n: IFakeNode) => boolean): IFakeNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findLive(child, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

function appView(): IFakeNode {
  const node = findLive(fabric.appRoot(), n => n.viewName === 'RCTImageView');
  if (node === undefined) throw new Error('no RCTImageView committed');
  return node;
}

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
} as const;
const IMAGE_OUT = join(__dirname, '.smoke-compiled-animated-image.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-image-parent.mjs');

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

async function loadParent(): Promise<Component> {
  const imageSource = readFileSync(join(__dirname, 'AnimatedImage.svelte'), 'utf8');
  compileToFile(imageSource, 'AnimatedImage.svelte', IMAGE_OUT);

  compileToFile(
    `<script>
       import AnimatedImage from './.smoke-compiled-animated-image.mjs';
       let { source, style, resizeMode } = $props();
     </script>
     <AnimatedImage {source} {style} {resizeMode} />`,
    'ImageParent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('ImageParent.svelte produced no default export');
  }
  return mod.default as Component;
}

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(IMAGE_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
});

describe('Animated.Image (real compiled source) (Positive)', () => {
  // why: a hand-rolled pass-through bag would commit `source` as the bare object it arrived as;
  // RCTImageView's ViewConfig expects the resolved ARRAY shape buildImageBag produces — this is
  // the exact regression the component's own header comment warns about.
  it('routes non-animated props through buildImageBag, not a raw pass-through bag', async () => {
    const ImageParent = await loadParent();

    mount(ROOT_TAG, ImageParent, {
      source: { uri: 'https://example.com/a.png' },
      style: {},
      resizeMode: 'cover',
    });
    await tick();
    await tick();

    const node = appView();
    expect(node.viewName).toBe('RCTImageView');
    expect(node.props.source).toEqual([{ uri: 'https://example.com/a.png' }]);
    expect(node.props.resizeMode).toBe('cover');
  });

  // why: `style` must survive buildImageBag's own field-splitting and stay reactive — an
  // AnimatedValue driving `style.opacity` is exactly the supported animate-an-Image use named in
  // the component's own header comment (as opposed to animating `source`, which is not).
  it('drives an animated style prop reactively through buildImageBag', async () => {
    const ImageParent = await loadParent();
    const opacity = new AnimatedValue(0.5);

    mount(ROOT_TAG, ImageParent, {
      source: { uri: 'https://example.com/a.png' },
      style: { opacity },
      resizeMode: 'cover',
    });
    await tick();
    await tick();

    expect(appView().props.opacity).toBe(0.5);

    opacity.setValue(1);
    await tick();

    expect(appView().props.opacity).toBe(1);
  });
});
