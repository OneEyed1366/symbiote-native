// Real-execution proof (not just typecheck) that ImageBackground/index.svelte calls the real
// renderImageBackground() — added after finding it was hand-duplicating the absolute-fill +
// wrapper-dimension proxy logic instead of calling the shared core fn (2026-08-12, same bug
// class as Switch/ActivityIndicator/TextInput). Compiles the REAL index.svelte source, mounts
// it, and asserts the wrapper/image shape plus the dimension-proxy behavior renderImageBackground
// exists to produce: the inner Image inherits the wrapper's explicit width/height so it fills
// the box instead of collapsing to the source's intrinsic size.
//
// Coverage ledger (per CLAUDE.md's <components_split_logic_view_lifecycle>):
//   - renderImageBackground()'s own fold logic (absolute-fill positioning, wrapper-dimension
//     proxy onto the inner Image, source resolution) — N/A for the fold's INTERNAL branches:
//     covered directly at core/components/src/__tests__/wave1-core.test.ts's `renderImageBackground`
//     describe block (structural child shape, absolute-fill, dimension proxy, source/resizeMode
//     forwarding). This file instead proves index.svelte actually CALLS that function and wires
//     its two fixed positions (`descriptor.props` / `descriptor.children[0].props`) onto the two
//     literal host tags — covered below.
//   - live `children` (the marker View) landing as a real sibling AFTER the image, not swallowed
//     or reordered — covered below.
//   - the §16 whitespace hazard between the literal `<symbiote-image>` and `{@render children}`
//     tags (a real bug this exact test caught and got fixed alongside, per the file header) —
//     covered below implicitly: an exact 2-child assertion (image then marker) would fail if a
//     stray whitespace text node were reintroduced between them.
//   - `imageStyle` as a bare className string resolving through `resolveClassName` (adapter-owned
//     code — the ternary in index.svelte, not core/components') — covered below.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_501;
const OUT = join(__dirname, '.smoke-compiled-image-background.mjs');
// Node's import() caches by resolved file path (svelte-adapter-dom-shim skill §15), so a second
// scenario baking a DIFFERENT markup string into the compiled parent needs its OWN filename or it
// silently re-imports the first scenario's stale module.
const PARENT_OUT = join(__dirname, '.smoke-compiled-image-background-parent.mjs');
const PARENT_STYLE_OUT = join(__dirname, '.smoke-compiled-image-background-parent-style.mjs');
// Co-located next to the REAL View.svelte (one level up) so a relative import from PARENT_OUT
// resolves it, following button.smoke.test.ts's precedent for pulling in a real sibling.
const VIEW_OUT = join(__dirname, '..', '.smoke-compiled-view-for-image-background.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
  rmSync(PARENT_STYLE_OUT, { force: true });
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

async function loadMountable(imageStyle?: string): Promise<Component> {
  const source = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  compileToFile(source, 'ImageBackground.svelte', OUT);

  compileToFile(
    readFileSync(join(__dirname, '..', 'View.svelte'), 'utf8'),
    'View.svelte',
    VIEW_OUT,
  );

  const imageStyleAttr = imageStyle === undefined ? '' : ` imageStyle="${imageStyle}"`;
  const parentOut = imageStyle === undefined ? PARENT_OUT : PARENT_STYLE_OUT;

  // No whitespace anywhere between the </script> and the markup, or between sibling elements —
  // Svelte's whitespace-collapse turns any indentation between siblings into a real
  // single-space text-node child, invalid as a symbiote-view child (skill §16). This bit
  // ImageBackground/index.svelte itself too (fixed alongside this test).
  compileToFile(
    '<script>\n' +
      "  import ImageBackground from './.smoke-compiled-image-background.mjs';\n" +
      "  import View from '../.smoke-compiled-view-for-image-background.mjs';\n" +
      '</script>' +
      `<ImageBackground style={{ width: 200, height: 100 }}${imageStyleAttr} source={{ uri: 'https://example.test/x.png' }}><View testID="marker" /></ImageBackground>`,
    'Parent.svelte',
    parentOut,
  );

  const mod: unknown = await import(`file://${parentOut}`);
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
  // No Negative group: ImageBackground is a pure render-only composition (renderImageBackground()
  // + two literal host tags) with no guard clause and no throwing path.
  describe('Positive (composes the wrapper/image/children shape and resolves styles)', () => {
    // why: proves index.svelte calls the real renderImageBackground() and destructures its fixed
    // Descriptor shape onto the two literal host tags, AND that live `children` land as a real
    // sibling after the image with no stray whitespace text node between them (svelte-adapter-
    // dom-shim skill §16 — an exact 2-child read fails immediately if that regresses).
    it('commits View(RCTImageView, marker) with the wrapper dimensions proxied onto the Image', async () => {
      const Parent = await loadMountable();
      mount(ROOT_TAG, Parent);
      await tick();
      await tick();

      const wrapper = findInCommittedTree(
        node =>
          node.viewName === 'RCTView' && node.children.some(c => c.viewName === 'RCTImageView'),
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

      expect(wrapper.children).toHaveLength(2);
      const marker = wrapper.children[1];
      expect(marker?.viewName).toBe('RCTView');
      expect(marker?.props.testID).toBe('marker');
    });

    // why: a bare `imageStyle` string is a registered class name, not literal CSS — index.svelte
    // must resolve it through the shared style registry (resolveClassName) and MERGE it onto the
    // inner Image, after the dimension proxy, rather than forwarding the raw string to native
    // (which Fabric cannot consume as a style value).
    it('resolves a string imageStyle through the class registry and merges it onto the Image', async () => {
      registerStyles({ ibTint: { opacity: 0.5 } });
      const Parent = await loadMountable('ibTint');
      mount(ROOT_TAG, Parent);
      await tick();
      await tick();

      const image = fabric.find(node => node.viewName === 'RCTImageView');
      expect(image).toBeDefined();
      // Both survive: the registry-resolved opacity, and the dimension proxy this component
      // applies independently of imageStyle.
      expect(image?.props.opacity).toBe(0.5);
      expect(image?.props.width).toBe(200);
    });
  });
});
