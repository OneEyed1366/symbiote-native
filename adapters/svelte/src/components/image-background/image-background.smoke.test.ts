// Real-execution proof (not just typecheck) that ImageBackground/index.svelte calls the real
// renderImageBackground() — added after finding it was hand-duplicating the absolute-fill +
// wrapper-dimension proxy logic instead of calling the shared core fn (2026-08-12, same bug
// class as Switch/ActivityIndicator/TextInput). Compiles the REAL index.svelte source, mounts
// it, and asserts the wrapper/image shape plus the dimension-proxy behavior renderImageBackground
// exists to produce: the inner Image inherits the wrapper's explicit width/height so it fills
// the box instead of collapsing to the source's intrinsic size.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_501;
const OUT = join(__dirname, '.smoke-compiled-image-background.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-image-background-parent.mjs');
// Co-located next to the REAL View.svelte (one level up) so a relative import from PARENT_OUT
// resolves it, following button.smoke.test.ts's precedent for pulling in a real sibling.
const VIEW_OUT = join(__dirname, '..', '.smoke-compiled-view-for-image-background.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
  rmSync(VIEW_OUT, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
} as const;

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

async function loadMountable(): Promise<Component> {
  const source = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  compileToFile(source, 'ImageBackground.svelte', OUT);

  compileToFile(
    readFileSync(join(__dirname, '..', 'View.svelte'), 'utf8'),
    'View.svelte',
    VIEW_OUT,
  );

  // No whitespace anywhere between the </script> and the markup, or between sibling elements —
  // Svelte's whitespace-collapse turns any indentation between siblings into a real
  // single-space text-node child, invalid as a symbiote-view child (skill §16). This bit
  // ImageBackground/index.svelte itself too (fixed alongside this test).
  compileToFile(
    '<script>\n' +
      "  import ImageBackground from './.smoke-compiled-image-background.mjs';\n" +
      "  import View from '../.smoke-compiled-view-for-image-background.mjs';\n" +
      '</script>' +
      '<ImageBackground style={{ width: 200, height: 100 }} source={{ uri: \'https://example.test/x.png\' }}><View testID="marker" /></ImageBackground>',
    'Parent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('Parent.svelte produced no default export');
  }
  return mod.default as Component;
}

// Walks the CURRENTLY COMMITTED tree, unlike `fabric.find`, which walks the fake Fabric's
// `created` log — every node ever createNode'd this run, clones excluded — so it keeps
// returning the ORIGINAL pre-clone snapshot forever, stale the moment a later commit clones
// the node with new props (mirrors modal.smoke.test.ts's own `findInCommittedTree`; the two
// style properties here reach the wrapper/inner-Image nodes via a SECOND, `$effect`-driven
// commit — see index.svelte's note on `requestActiveCommit` — so a `fabric.find` snapshot
// taken after mount would miss them).
function findInCommittedTree(predicate: (node: IFakeNode) => boolean): IFakeNode | undefined {
  function walk(nodes: IFakeNode[]): IFakeNode | undefined {
    for (const node of nodes) {
      if (predicate(node)) return node;
      const found = walk(node.children);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  return walk(fabric.appRoot().children);
}

describe('ImageBackground (real compiled index.svelte)', () => {
  it('commits View(RCTImageView, marker) with the wrapper dimensions proxied onto the Image', async () => {
    const Parent = await loadMountable();
    mount(ROOT_TAG, Parent);
    await tick();
    await tick();

    const wrapper = findInCommittedTree(
      node => node.viewName === 'RCTView' && node.children.some(c => c.viewName === 'RCTImageView'),
    );
    expect(wrapper).toBeDefined();
    if (wrapper === undefined) return;

    const image = wrapper.children[0];
    expect(image?.viewName).toBe('RCTImageView');
    // renderImageBackground's whole point: an explicit wrapper width/height is proxied onto the
    // absolute-fill Image so it fills the box (RN copies these; the Image would otherwise
    // collapse to the source's intrinsic size).
    expect(image?.props.width).toBe(200);
    expect(image?.props.height).toBe(100);
    expect(image?.props.position).toBe('absolute');

    const marker = wrapper.children[1];
    expect(marker?.viewName).toBe('RCTView');
    expect(marker?.props.testID).toBe('marker');
  });
});
