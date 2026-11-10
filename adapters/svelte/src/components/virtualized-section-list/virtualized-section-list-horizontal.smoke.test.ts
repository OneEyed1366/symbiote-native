// RN takes `horizontal` through VirtualizedListProps: the section list content is pinned to the row
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import '../../register';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_302;
const ITEM_WIDTH = 40;
const SECTIONS = [
  { title: 'A', data: ['a0', 'a1'] },
  { title: 'B', data: ['b0', 'b1'] },
];
// Header, two items and footer per section
const ENTRY_COUNT = 8;

const COMPONENTS_DIR = join(__dirname, '..');
const LIST_OUT = join(
  COMPONENTS_DIR,
  'virtualized-list',
  '.horizontal-smoke-compiled-virtualized-list.mjs',
);
const SECTION_LIST_OUT = join(
  __dirname,
  '.horizontal-smoke-compiled-virtualized-section-list.mjs',
);
const SECTION_CELL_OUT = join(
  __dirname,
  '.horizontal-smoke-compiled-section-item-cell.mjs',
);
const WRAPPER_OUT = join(
  COMPONENTS_DIR,
  'section-list',
  '.horizontal-smoke-compiled-section-list.mjs',
);
const ROOT_OUT = join(__dirname, '.horizontal-smoke-compiled-root.mjs');
const WRAPPER_ROOT_OUT = join(
  __dirname,
  '.horizontal-smoke-compiled-wrapper-root.mjs',
);

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());

afterEach(() => {
  unmount(ROOT_TAG);
  for (const path of [
    LIST_OUT,
    SECTION_LIST_OUT,
    SECTION_CELL_OUT,
    WRAPPER_OUT,
    ROOT_OUT,
    WRAPPER_ROOT_OUT,
  ]) {
    rmSync(path, { force: true });
  }
});

function compiled(source: string, filename: string): string {
  return compile(source, {
    generate: 'client',
    fragments: 'tree',
    css: 'external',
    filename,
  }).js.code;
}

function compileTree(): void {
  writeFileSync(
    LIST_OUT,
    compiled(
      readFileSync(
        join(COMPONENTS_DIR, 'virtualized-list', 'index.svelte'),
        'utf8',
      ),
      'VirtualizedList.svelte',
    ),
  );
  writeFileSync(
    SECTION_LIST_OUT,
    compiled(
      readFileSync(join(__dirname, 'index.svelte'), 'utf8'),
      'VirtualizedSectionList.svelte',
    )
      .replace(
        "from '../virtualized-list/index.svelte'",
        "from '../virtualized-list/.horizontal-smoke-compiled-virtualized-list.mjs'",
      )
      .replace(
        "from './section-item-cell.svelte'",
        "from './.horizontal-smoke-compiled-section-item-cell.mjs'",
      ),
  );
  writeFileSync(
    SECTION_CELL_OUT,
    compiled(
      readFileSync(join(__dirname, 'section-item-cell.svelte'), 'utf8'),
      'SectionItemCell.svelte',
    ),
  );
  writeFileSync(
    WRAPPER_OUT,
    compiled(
      readFileSync(
        join(COMPONENTS_DIR, 'section-list', 'index.svelte'),
        'utf8',
      ),
      'SectionList.svelte',
    ).replace(
      "from '../virtualized-section-list/index.svelte'",
      "from '../virtualized-section-list/.horizontal-smoke-compiled-virtualized-section-list.mjs'",
    ),
  );
}

async function loadRoot(importLine: string, tag: string, out: string) {
  compileTree();
  writeFileSync(
    out,
    compiled(
      `<script>
         import List from '${importLine}';
         let { sections, getItemLayout } = $props();
       </script>
       {#snippet cell({ item })}<text p={{ text: item }}></text>{/snippet}
       <List {sections} {getItemLayout} item={cell} horizontal={true} />`,
      `${tag}.svelte`,
    ),
  );
  const mod: unknown = await import(`file://${out}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`${tag}.svelte produced no default export`);
  }
  return mod.default as Component;
}

async function contentWidth(root: Component): Promise<unknown> {
  mount(ROOT_TAG, root, {
    sections: SECTIONS,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_WIDTH,
      offset: ITEM_WIDTH * index,
      index,
    }),
  });
  await tick();
  const scrollView = fabric.find(node => node.viewName === 'RCTScrollView');
  if (scrollView === undefined) throw new Error('no scroll view committed');
  fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
    layout: { width: 300, height: 600 },
  });
  await tick();
  await tick();
  return live.findLive(
    live.appRoot(),
    node => node.viewName === 'RCTScrollContentView',
  )?.payload.width;
}

describe('Svelte section list with horizontal', () => {
  it('pins the VirtualizedSectionList content to the full row width', async () => {
    const root = await loadRoot(
      './.horizontal-smoke-compiled-virtualized-section-list.mjs',
      'HorizontalRoot',
      ROOT_OUT,
    );

    expect(await contentWidth(root)).toBe(ENTRY_COUNT * ITEM_WIDTH);
  });

  it('relays horizontal through SectionList', async () => {
    const root = await loadRoot(
      '../section-list/.horizontal-smoke-compiled-section-list.mjs',
      'HorizontalWrapperRoot',
      WRAPPER_ROOT_OUT,
    );

    expect(await contentWidth(root)).toBe(ENTRY_COUNT * ITEM_WIDTH);
  });
});
