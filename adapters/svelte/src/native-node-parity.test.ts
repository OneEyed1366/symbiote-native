// CROSS-ADAPTER DIFFERENTIAL / CHARACTERIZATION: how many NATIVE Fabric nodes does each adapter
// create for the same intended UI?
//
// Why this exists: `examples/svelte` measured ~20 MB more device RSS than `examples/vue-sfc` on
// an equivalent screen, and every cheap explanation died under measurement — the Svelte iOS dev
// bundle is the SMALLEST of the three adapters (5.9M vs Vue's 6.0M), and the dom-shim's own JS
// cost is 548 B/node, about 1 MB for a realistic screen (svelte-adapter-dom-shim §11b). An RN
// process's footprint is dominated by NATIVE memory — shadow nodes and views — not JS objects,
// so the question that actually matters is whether the shim makes the engine emit more native
// nodes than Vue's renderer does for identical markup.
//
// ANSWER, locked in below: no. Svelte emits exactly ONE extra node in total — a constant root
// wrapper — and the rest of the tree is node-for-node identical. That is a fixed cost of about
// half a kilobyte, so this file is the proof that native node inflation is NOT the explanation
// for a multi-megabyte gap. Do not go looking here again; measure JS heap on device instead.
//
// `counts.createNode` is the honest instrument: the fake Fabric counts real createNode calls and
// excludes clones, so this measures native node PRODUCTION, not commit churn.
//
// The Svelte template is packed edge-to-edge deliberately (§16): whitespace between siblings
// compiles to real RCTRawText nodes, and leaving it in would measure that known hazard instead
// of the structural question being asked here.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { h } from '@vue/runtime-core';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount as svelteMount, unmount as svelteUnmount } from './render';
import { mount as vueMount, unmount as vueUnmount } from '@symbiote-native/vue';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const SVELTE_ROOT = 92_001;
const VUE_ROOT = 92_002;
const ROWS = [1, 2, 3, 4, 5];
const TMP_DIR = join(__dirname, '../build/__parity__');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  svelteUnmount(SVELTE_ROOT);
  vueUnmount(VUE_ROOT);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

async function compileComponent(source: string, name: string): Promise<Component> {
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

function byViewName(nodes: readonly IFakeNode[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const node of nodes) tally[node.viewName] = (tally[node.viewName] ?? 0) + 1;
  return tally;
}

// `serialize` renders one node as `RCTView(<children>)`; strip that one layer so two trees that
// differ only by a wrapper can be compared at the same depth.
function stripOuter(tree: string): string {
  const open = tree.indexOf('(');
  if (open < 0 || !tree.endsWith(')')) throw new Error(`not a wrapped tree: ${tree}`);
  return tree.slice(open + 1, -1);
}

// Same intended UI on both sides: an outer view wrapping five rows, each row holding a label
// with an interpolated value and a static suffix.
const SVELTE_SOURCE = `<script>const rows = [${ROWS.join(', ')}];</script>
<symbiote-view p={{}}>{#each rows as row}<symbiote-view p={{}}><symbiote-text p={{}}>row {row}</symbiote-text><symbiote-text p={{}}>ok</symbiote-text></symbiote-view>{/each}</symbiote-view>`;

const VueRoot = {
  render() {
    return h(
      'symbiote-view',
      null,
      ROWS.map(row =>
        h('symbiote-view', null, [
          h('symbiote-text', null, `row ${row}`),
          h('symbiote-text', null, 'ok'),
        ]),
      ),
    );
  },
};

// No Negative group: this is a cross-adapter structural invariant, not a unit with a throwing
// contract — the only outcome that matters is whether the two committed trees agree.
// No Negative group: this is a cross-adapter structural invariant, not a unit with a throwing
// contract — the only outcome that matters is whether the two committed trees agree.
describe('native node production per adapter, same UI', () => {
  describe('Positive', () => {
    it('differs from Vue by exactly one constant root wrapper, nothing per-element', async () => {
      // why: the product rule this file locks in — the Svelte shim must not inflate native
      // Fabric node count beyond its one constant root-wrapper cost (see the file header for
      // the investigation that ruled out every other explanation for the measured RSS gap). A
      // regression here means the shim started emitting extra native nodes per element, which
      // is exactly the class of bug §16 (stray whitespace -> real RCTRawText) already caused.
      const SvelteRoot = await compileComponent(SVELTE_SOURCE, 'ParityRoot');

      svelteMount(SVELTE_ROOT, SvelteRoot);
      await tick();
      await tick();
      const svelteCreated = [...fabric.created];
      const svelteTree = fabric.serialize([fabric.appRoot()]);

      fabric.reset();

      vueMount(VUE_ROOT, VueRoot);
      await tick();
      await tick();
      const vueCreated = [...fabric.created];
      const vueTree = fabric.serialize([fabric.appRoot()]);

      // root-element.ts puts a wrapper ShimElement between the engine's synthetic box-none
      // AppContainer and the app's own root, because Svelte's compiled output mounts through an
      // anchor rather than handing us a root node the way Vue/React do. It carries flex:1 so a
      // flex:1 app root still fills the screen (mount-pipeline.smoke.test.ts covers that).
      // Peeling BOTH layers off the Svelte tree and ONE off Vue's must leave identical trees.
      expect(stripOuter(stripOuter(svelteTree)), 'tree below the adapter wrappers').toBe(
        stripOuter(vueTree),
      );

      const svelteTally = byViewName(svelteCreated);
      const vueTally = byViewName(vueCreated);
      expect(svelteTally, 'the only difference is one extra RCTView').toEqual({
        ...vueTally,
        RCTView: (vueTally.RCTView ?? 0) + 1,
      });

      // Stated as a constant, not a ratio, on purpose: if this ever starts scaling with ROWS the
      // assertion breaks loudly, which is exactly the regression worth catching.
      expect(svelteCreated.length, 'total native nodes created').toBe(vueCreated.length + 1);
    });
  });
});
