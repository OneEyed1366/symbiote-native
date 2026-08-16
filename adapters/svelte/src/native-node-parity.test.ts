// CROSS-ADAPTER DIFFERENTIAL / CHARACTERIZATION: how many NATIVE Fabric nodes does each adapter
// create for the same intended UI?
//
// Why this exists: `examples/svelte` measured ~20 MB more device RSS than `examples/vue-sfc` on
// an equivalent screen, and every cheap explanation died under measurement (originally against
// the DOM-shim strategy, svelte-adapter-dom-shim §11b, now superseded). An RN process's footprint
// is dominated by NATIVE memory — shadow nodes and views — not JS objects, so the question that
// actually matters is whether the adapter makes the engine emit more native nodes than Vue's
// renderer does for identical markup.
//
// ANSWER, RE-MEASURED against the official custom-renderer API (2026-08-16): still no per-element
// inflation — the rest of the tree below the wrappers is node-for-node identical — but the fixed
// per-mount overhead is now THREE nodes, not one, and two of the three are NOT this adapter's own
// doing. `render.ts`'s own `symbiote-view` wrapper accounts for one (unchanged rationale — Svelte
// mounts through an anchor rather than handing us a root node the way Vue/React do). The other
// two are real, empty `create_text('')` calls made by SVELTE'S OWN internal bootstrap whenever
// `mount()` is called without an explicit `anchor` option (`render.ts` never passes one):
// `_mount_inner`'s own `anchor_node` (`render.js`) and — for a component whose own top-level
// content has no static leading element, true of this file's fixture — the compiler's `$.comment()`
// wrapper's trailing range-end marker (`dom/template.js`). Both are dispatched to our renderer
// exactly like any other text node (confirmed by reading `render.js`/`dom/template.js` directly);
// `isAnchor()` only skips a node built via `createComment`/`createAnchor`, not an empty raw-text
// node, so the engine's commit walk does not skip them either. `isSvelteBootstrapAnchor` below
// filters them out of the STRUCTURAL comparison (so the two extra empty nodes don't look like a
// per-element regression) while still counting them explicitly in the tally/total assertions, so
// this fixed cost stays visible and measured rather than silently hidden. Do not go looking here
// again for a multi-megabyte explanation; measure JS heap on device instead.
//
// `counts.createNode` is the honest instrument: the fake Fabric counts real createNode calls and
// excludes clones, so this measures native node PRODUCTION, not commit churn.
//
// The Svelte template is packed edge-to-edge deliberately: whitespace between siblings compiles
// to real RCTRawText nodes, and leaving it in would measure that known hazard instead of the
// structural question being asked here.

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
    experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
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

// See this file's header: two real, empty `create_text('')` calls from Svelte's OWN mount
// bootstrap always land somewhere in the tree — one as a trailing sibling of the `{#each}`
// block's own rendered items (`$.comment()`'s own anchor pair, needed for the block's insertion
// point even though the ENCLOSING element is static), the other as a trailing sibling of the
// app's own root view directly under render.ts's wrapper (`_mount_inner`'s own `anchor_node`).
// Neither is nested consistently enough for a fixed-depth `stripOuter` to peel off, so both the
// STRUCTURAL comparison and the raw creation list filter by this predicate instead.
function isSvelteBootstrapAnchor(node: IFakeNode): boolean {
  return node.viewName === 'RCTRawText' && node.props.text === '';
}

// Mirrors fake-fabric.ts's own `serializeNode`, recursively dropping bootstrap anchors at every
// level rather than just the top one.
function serializeWithoutBootstrapAnchors(node: IFakeNode): string {
  const text = node.viewName === 'RCTRawText' ? ` "${String(node.props.text)}"` : '';
  const kids = node.children.filter(child => !isSvelteBootstrapAnchor(child));
  const kidsStr = kids.length ? `(${kids.map(serializeWithoutBootstrapAnchors).join('')})` : '';
  return `${node.viewName}${text}${kidsStr}`;
}

// Same intended UI on both sides: an outer view wrapping five rows, each row holding a label
// with an interpolated value and a static suffix.
const SVELTE_SOURCE = `<script>const rows = [${ROWS.join(', ')}];</script>
<symbiote-view>{#each rows as row}<symbiote-view><symbiote-text>row {row}</symbiote-text><symbiote-text>ok</symbiote-text></symbiote-view>{/each}</symbiote-view>`;

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
      // Captured NOW, before `fabric.reset()` + the Vue mount below reassign what
      // `fabric.appRoot()` resolves to — `IFakeNode` objects are plain, independent of the
      // recorder's own arrays, so holding this reference across the reset is safe.
      const svelteWrapper = fabric.appRoot().children[0];

      fabric.reset();

      vueMount(VUE_ROOT, VueRoot);
      await tick();
      await tick();
      const vueCreated = [...fabric.created];
      const vueTree = fabric.serialize([fabric.appRoot()]);

      // render.ts's mount() puts a wrapper `symbiote-view` between the engine's synthetic
      // box-none AppContainer and the app's own root, because Svelte's mount() needs a real
      // target node to insert into rather than handing us a root node the way Vue/React do. It
      // carries flex:1 so a flex:1 app root still fills the screen (mount-pipeline.smoke.test.ts
      // covers that). Below that wrapper, the app's own root view carries the two Svelte-
      // bootstrap empty-text anchors at DIFFERENT depths (one as its own trailing child from the
      // `{#each}` block's own anchor, one as the wrapper's OTHER child from `_mount_inner`'s own
      // anchor) — `serializeWithoutBootstrapAnchors` strips both, recursively, wherever they
      // land. Peeling ONE layer off Vue's tree and recursively-filtering-then-joining the
      // wrapper's real children must leave identical trees.
      expect(svelteWrapper, 'the render.ts wrapper committed').toBeDefined();
      const svelteContentTree = (svelteWrapper?.children ?? [])
        .filter(child => !isSvelteBootstrapAnchor(child))
        .map(serializeWithoutBootstrapAnchors)
        .join('');
      expect(svelteContentTree, 'tree below the adapter wrappers').toBe(stripOuter(vueTree));

      const bootstrapAnchors = svelteCreated.filter(isSvelteBootstrapAnchor);
      expect(
        bootstrapAnchors,
        'exactly two Svelte-internal empty-text bootstrap anchors',
      ).toHaveLength(2);

      const svelteTally = byViewName(svelteCreated.filter(node => !isSvelteBootstrapAnchor(node)));
      const vueTally = byViewName(vueCreated);
      expect(
        svelteTally,
        'excluding the two bootstrap anchors, the only difference is one extra RCTView',
      ).toEqual({
        ...vueTally,
        RCTView: (vueTally.RCTView ?? 0) + 1,
      });

      // Stated as a constant, not a ratio, on purpose: if this ever starts scaling with ROWS the
      // assertion breaks loudly, which is exactly the regression worth catching. +1 for
      // render.ts's own wrapper, +2 for Svelte's own mount-bootstrap anchors (this file's
      // header) — neither component of this fixed cost scales with ROWS.
      expect(svelteCreated.length, 'total native nodes created').toBe(vueCreated.length + 3);
    });
  });
});
