// EXACTLY ONE thing may build a ScrollView's content node, and from 2026-09-07 that thing is the
// engine: `registerScrollViewBehavior()` puts a `buildStructure` on the scroll tags. Anything in
// this adapter that ALSO emits `scroll-content` gives the tree a second `RCTScrollContentView`
// nested inside the first — no error, no warning, and on a device only a layout that is subtly
// wrong. This file is the guard for that, across every Svelte component that reaches a scroll node.
//
// WHY IT IS A SEPARATE FILE from scroll-view.smoke.test.ts / virtualized-list.smoke.test.ts. Those
// assert what a component paints; this asserts a property of the OWNERSHIP, and it has to hold for
// the ScrollView wrapper and for the list family at once. A second owner reappearing in one of them
// is the failure mode, so the assertion has to enumerate them together.
//
// THE CONTROL ARM is the part that makes the count mean anything: `expect(contentNodes).toBe(1)`
// passes on a tree with no ScrollView in it at all, and would go on passing if the mount silently
// produced nothing. Every case therefore also pins the owner count and asserts the app's own child
// is a DESCENDANT of the one content node — a capability an app depends on, rather than a shape
// (`.claude/rules/adapter-parity-audit.md`, "Phrase a parity oracle as a CAPABILITY").

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { STICKY_HEADER_Z_INDEX } from '@symbiote-native/components';
// Mounting through `../../render` skips `index.ts`, so the registration has to be named here —
// and it is the whole subject of this file.
import '../../register';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_031;
const COMPONENTS_DIR = join(__dirname, '..');
// Names distinct from every other suite's compiled output: these files sit in the REAL source
// directories (so each compiled module's own relative imports keep resolving) and the suites run
// concurrently, so a shared name is a race.
const LIST_OUT = join(
  COMPONENTS_DIR,
  'virtualized-list',
  '.owner-compiled-virtualized-list.mjs',
);
// One path PER CASE, never one path rewritten between them. Node's ESM cache is keyed by resolved
// URL, so re-writing a single root and re-importing it hands back the first case's module — and
// that failure is silent in exactly the direction this file cannot afford: every later case then
// measures case one's tree and its node counts pass. A `?t=` query on the specifier does NOT get
// round it under vite-node. Measured here, on the first run of this file.
const rootOutFor = (name: string): string =>
  join(__dirname, `.owner-compiled-root-${name}.mjs`);
const ROOT_NAMES = ['sv-v', 'sv-h', 'sv-r', 'sv-s', 'vl-v', 'vl-h'] as const;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  for (const path of [LIST_OUT, ...ROOT_NAMES.map(rootOutFor)]) {
    rmSync(path, { force: true });
  }
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(
  source: string,
  filename: string,
  outPath: string,
): void {
  writeFileSync(
    outPath,
    compile(source, { ...COMPILE_OPTIONS, filename }).js.code,
  );
}

function compileTree(): void {
  compileToFile(
    readFileSync(
      join(COMPONENTS_DIR, 'virtualized-list', 'index.svelte'),
      'utf8',
    ),
    'VirtualizedList.svelte',
    LIST_OUT,
  );
}

async function loadRoot(name: string, body: string): Promise<Component> {
  const ROOT_OUT = rootOutFor(name);
  compileTree();
  compileToFile(
    `<script>
       import VirtualizedList from '../virtualized-list/.owner-compiled-virtualized-list.mjs';
       const DATA = [{ id: 0 }, { id: 1 }, { id: 2 }];
       function getItem(source, index) { return source[index]; }
       function getItemCount(source) { return source.length; }
       function keyExtractor(item) { return 'k-' + item.id; }
     </script>
     ${body}`,
    'ContentOwnerRoot.svelte',
    ROOT_OUT,
  );
  const mod: unknown = await import(`file://${ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('ContentOwnerRoot.svelte produced no default export');
  }
  const component = mod.default;
  if (typeof component !== 'function')
    throw new Error(
      'ContentOwnerRoot.svelte default export is not a component',
    );
  return component;
}

function collect(
  nodes: readonly IFakeNode[],
  match: (node: IFakeNode) => boolean,
): IFakeNode[] {
  const found: IFakeNode[] = [];
  for (const node of nodes) {
    if (match(node)) found.push(node);
    found.push(...collect(node.children, match));
  }
  return found;
}

function byViewName(name: string): IFakeNode[] {
  return collect(fabric.committed, node => node.viewName === name);
}

// iOS resolves BOTH axes to RCTScrollView / RCTScrollContentView (the horizontal split is an
// Android ViewManager), and the headless name table is the iOS one — so the counts below are per
// AXIS run, not per tag name, and a horizontal case that silently rendered the vertical tag would
// still have to produce exactly one of each.
const SCROLL_VIEW = 'RCTScrollView';
const CONTENT_VIEW = 'RCTScrollContentView';

function assertSingleContentNode(probeText: string): void {
  const owners = byViewName(SCROLL_VIEW);
  const contents = byViewName(CONTENT_VIEW);
  // The control: without this a mount that produced NOTHING would satisfy a `toBe(1)` on a count
  // taken from an empty tree only by accident, and satisfy `toBeLessThan(2)` always.
  expect(owners.length, 'exactly one scroll view committed').toBe(1);
  expect(contents.length, 'exactly one content view committed').toBe(1);
  // …and the second half of the control: the content node is the one the app's children reached,
  // not an empty extra box beside them.
  const probes = collect(
    contents[0].children,
    node => node.props.text === probeText,
  );
  expect(probes.length, `"${probeText}" sits under the content view`).toBe(1);
}

async function mountRoot(name: string, body: string): Promise<void> {
  const Root = await loadRoot(name, body);
  mount(ROOT_TAG, Root, {});
  await tick();
  await tick();
}

describe('the engine is the only builder of a ScrollView content node', () => {
  it('scroll-view, vertical', async () => {
    await mountRoot(
      'sv-v',
      '<scroll-view><text p={{ text: "sv-v" }}></text></scroll-view>',
    );
    assertSingleContentNode('sv-v');
  });

  // The AXIS comes from the tag, never from a prop — that is what keeps the native component, the
  // row content style and the payload flag from disagreeing (RN derives all three from one prop,
  // so the mismatch is unrepresentable there).
  it('horizontal-scroll-view', async () => {
    await mountRoot(
      'sv-h',
      '<horizontal-scroll-view><text p={{ text: "sv-h" }}></text></horizontal-scroll-view>',
    );
    assertSingleContentNode('sv-h');
  });

  // A refresh-control is CLAIMED by the owner and kept beside the content view. It is the one child
  // that must not add a box of its own to the count.
  it('scroll-view with a refresh-control beside the content view', async () => {
    await mountRoot(
      'sv-r',
      '<scroll-view><refresh-control p={{ refreshing: false }} />' +
        '<text p={{ text: "sv-r" }}></text></scroll-view>',
    );
    assertSingleContentNode('sv-r');
    expect(byViewName('PullToRefreshView').length).toBe(1);
  });

  // The behavior grew an index path that synthesizes a pin wrapper around a flagged paint child.
  // A synthesized wrapper is a node this file did not put there, so the count has to survive it.
  it('scroll-view, a stickyHeaderIndices child adds no second content node', async () => {
    await mountRoot(
      'sv-s',
      '<scroll-view p={{ stickyHeaderIndices: [0] }}>' +
        '<text p={{ text: "sv-s" }}></text>' +
        '<text p={{ text: "sv-s2" }}></text></scroll-view>',
    );
    assertSingleContentNode('sv-s');
    // The pin IS committed now, and the flip is the point. The deleted wrapper destructured
    // `stickyHeaderIndices` out of its passthrough and dlogged that Svelte could not honour it —
    // true when a Snippet was the only view of the children, and false since the behavior started
    // walking the COMMITTED children instead (`sticky-indices.test.ts`, "the COMPATIBILITY half").
    // So the wrapper had been suppressing a working engine feature, and deleting it restored RN's
    // own API on this adapter. A zero here means the index walk stopped running.
    expect(
      collect(
        fabric.committed,
        node => node.props.zIndex === STICKY_HEADER_Z_INDEX,
      ).length,
    ).toBe(1);
  });

  // The list family is the SECOND owner this guard exists for: `virtualized-list/index.svelte`
  // authored `scroll-content` itself until the behavior took it over, and it never imported the
  // ScrollView wrapper — so an import grep reports it clean and only the committed tree does not.
  it('VirtualizedList, vertical', async () => {
    await mountRoot(
      'vl-v',
      '{#snippet cell({ item })}<text p={{ text: "vl-v-" + item.id }}></text>{/snippet}' +
        '<VirtualizedList data={DATA} {getItem} {getItemCount} {keyExtractor} item={cell} />',
    );
    assertSingleContentNode('vl-v-0');
  });

  it('VirtualizedList, horizontal', async () => {
    await mountRoot(
      'vl-h',
      '{#snippet cell({ item })}<text p={{ text: "vl-h-" + item.id }}></text>{/snippet}' +
        '<VirtualizedList horizontal data={DATA} {getItem} {getItemCount} {keyExtractor} item={cell} />',
    );
    assertSingleContentNode('vl-h-0');
  });

  // FlatList / SectionList / VirtualizedSectionList all render VirtualizedList and emit no scroll
  // tag of their own, so the two cases above cover them. Their own smokes assert the rest of the
  // tree; what would break this invariant is one of them growing a scroll tag, which is what the
  // grep in this test's sibling assertion answers.
  it('no Svelte source emits a content intrinsic any more', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const roots = [join(__dirname, '..', '..')];
    const offenders: string[] = [];
    while (roots.length > 0) {
      const dir = roots.pop();
      if (dir === undefined) break;
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          roots.push(full);
          continue;
        }
        if (!/\.(svelte|ts)$/.test(entry)) continue;
        if (full === __filename) continue;
        const source = readFileSync(full, 'utf8');
        if (/<(horizontal-)?scroll-content[\s>/]/.test(source))
          offenders.push(full);
      }
    }
    expect(offenders, 'only the engine builds the content node').toEqual([]);
  });
});
