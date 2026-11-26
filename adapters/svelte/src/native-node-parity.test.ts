// Cross-adapter differential: how many native Fabric nodes does each adapter create for one UI?

// `examples/svelte` measured ~20 MB more device RSS than `examples/vue-sfc` on the same screen
// The Svelte iOS dev bundle is the smallest of the three
// An RN process is dominated by native memory, so the question is whether Svelte emits more nodes

// ANSWER: no. Svelte emits exactly one extra node, a constant root wrapper of about half a KB
// So native node count does not explain the gap, measure the JS heap on device instead

// `counts.createNode` is the instrument: the fake Fabric counts real `createNode` calls, not clones

// The Svelte template is packed edge-to-edge, as whitespace between siblings compiles to real
// `RCTRawText` nodes and would measure that known hazard instead of the structure

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { h } from '@vue/runtime-core';
import { textOf } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';
import { mount as svelteMount, unmount as svelteUnmount } from './render';
import { mount as vueMount, unmount as vueUnmount } from '@symbiote-native/vue';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const SVELTE_ROOT = 92_001;
const VUE_ROOT = 92_002;
const ROWS = [1, 2, 3, 4, 5];
const TMP_DIR = join(__dirname, '../build/__parity__');

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  svelteUnmount(SVELTE_ROOT);
  vueUnmount(VUE_ROOT);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

async function compileComponent(
  source: string,
  name: string,
): Promise<Component> {
  const result = compile(source, {
    generate: 'client',
    filename: `${name}.svelte`,
    fragments: 'tree',
    css: 'external',
  });
  const file = join(TMP_DIR, `${name}.mjs`);
  writeFileSync(file, result.js.code);
  const mod: unknown = await import(`file://${file}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`compiled ${name}.svelte produced no default export`);
  }
  return mod.default as Component;
}

function byViewName(nodes: readonly IAuthoredNode[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const node of nodes)
    tally[node.viewName] = (tally[node.viewName] ?? 0) + 1;
  return tally;
}

// `serialize` renders one node as `RCTView(<children>)`; strip that one layer so two trees that
// differ only by a wrapper can be compared at the same depth.
function stripOuter(tree: string): string {
  const open = tree.indexOf('(');
  if (open < 0 || !tree.endsWith(')'))
    throw new Error(`not a wrapped tree: ${tree}`);
  return tree.slice(open + 1, -1);
}

// Same intended UI on both sides: an outer view wrapping five rows, each row holding a label
// with an interpolated value and a static suffix.
const SVELTE_SOURCE = `<script>const rows = [${ROWS.join(', ')}];</script>
<view p={{}}>{#each rows as row}<view p={{}}><text p={{}}>row {row}</text><text p={{}}>ok</text></view>{/each}</view>`;

const VueRoot = {
  render() {
    return h(
      'view',
      null,
      ROWS.map(row =>
        h('view', null, [h('text', null, `row ${row}`), h('text', null, 'ok')]),
      ),
    );
  },
};

// No Negative group: this is a structural invariant across adapters, not a unit that throws
// The only outcome that matters is whether the two committed trees agree
describe('native node production per adapter, same UI', () => {
  describe('Positive', () => {
    it('differs from Vue by exactly one constant root wrapper, nothing per-element', async () => {
      // The renderer must not inflate the native node count beyond one constant root wrapper
      // A regression means extra native nodes per element, as stray whitespace once caused
      const SvelteRoot = await compileComponent(SVELTE_SOURCE, 'ParityRoot');

      // An anchor (empty `viewName`) and an empty `RCTRawText` never reach `createNode`
      // Svelte leaves both as block anchors and Vue's `h()` none, which is no native difference
      const isNative = (node: IAuthoredNode): boolean =>
        node.viewName !== '' &&
        !(node.viewName === 'RCTRawText' && textOf(node.handle) === '');

      svelteMount(SVELTE_ROOT, SvelteRoot);
      await tick();
      await tick();
      const svelteCreated = fabric.findAll(isNative);
      const svelteTree = live.serialize(live.appRoot());

      fabric.reset();

      vueMount(VUE_ROOT, VueRoot);
      await tick();
      await tick();
      const vueCreated = fabric.findAll(isNative);
      const vueTree = live.serialize(live.appRoot());

      // `root-element.ts` puts a flex:1 wrapper between the AppContainer and the app root, as
      // Svelte mounts through an anchor rather than receiving a root node like Vue and React
      // Peeling both layers off the Svelte tree and one off Vue's must leave identical trees
      expect(
        stripOuter(stripOuter(svelteTree)),
        'tree below the adapter wrappers',
      ).toBe(stripOuter(vueTree));

      const svelteTally = byViewName(svelteCreated);
      const vueTally = byViewName(vueCreated);
      expect(svelteTally, 'the only difference is one extra RCTView').toEqual({
        ...vueTally,
        RCTView: (vueTally.RCTView ?? 0) + 1,
      });

      // Stated as a constant, not a ratio, on purpose: if this ever starts scaling with ROWS the
      // assertion breaks loudly, which is exactly the regression worth catching.
      expect(svelteCreated.length, 'total native nodes created').toBe(
        vueCreated.length + 1,
      );
    });
  });
});
