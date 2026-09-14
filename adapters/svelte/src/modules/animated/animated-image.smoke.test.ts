// Real-compiled-source smoke test for an animated `<image>` — there is no wrapper and no
// `Animated.Image`. Image is the one primitive whose props are FOLDED before they reach Fabric
// (source resolved to the array shape RCTImageView expects, resizeMode/tintColor lifted off
// style), so it is the place an animated value is likeliest to be lost — a fold that rebuilds the
// style object without carrying the node through would strand the subscription silently. Asserts
// both halves on one mount: the fold still happens, AND the animated opacity lands and repaints.
//
// Scope note: the fold itself is now the engine-side host behavior
// (`core/components/src/behaviors/image.ts`, registered by `../../register`), already covered
// there; here it is the thing the animated value has to survive.
//
// No Negative group: no prop on this path rejects — a `style` holding nothing animated is simply
// published unchanged (`bindAnimatedValue` returns its input by identity).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { AnimatedValue } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
// The fold is a host BEHAVIOR now, so it exists only once this side-effect module has run.
import '../../register';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}
globalThis.nativeModuleProxy = undefined;

const fabric = installFabric();
const ROOT_TAG = 91_104;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// fabric.find() walks the CREATION log, which never reflects a later clone's props
// (svelte-adapter-dom-shim skill §15's documented gotcha) — a live-value assertion must
// instead walk the currently COMMITTED tree, same as activity-indicator.smoke.test.ts's
// findLive.
function findLive(
  node: IFakeNode,
  predicate: (n: IFakeNode) => boolean,
): IFakeNode | undefined {
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
} as const;
const PARENT_OUT = join(__dirname, '.smoke-compiled-image-parent.mjs');

async function loadParent(): Promise<Component> {
  const result = compile(
    `<script>
       let { source, style, resizeMode } = $props();
     </script>
     <image {source} {style} {resizeMode}></image>`,
    { ...COMPILE_OPTIONS, filename: 'ImageParent.svelte' },
  );
  writeFileSync(PARENT_OUT, result.js.code);

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
