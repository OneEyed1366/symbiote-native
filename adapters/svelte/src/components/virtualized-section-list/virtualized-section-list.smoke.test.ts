// Real-execution proof (not just typecheck) that a user's `getItemLayout` reaches the shared
// windowing machinery WITH THE SECTIONS ARRAY, through both public entry points —
// VirtualizedSectionList directly and SectionList's prop-by-prop relay. Same harness shape as
// virtualized-list.smoke.test.ts: compile the REAL .svelte sources through svelte/compiler,
// co-locate each compiled file next to its real sibling (its own imports resolve relative to
// where it lands), installFabric(), mount for real.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_301;
const ITEM_HEIGHT = 40;

// Two sections, so the flattened stream (header/items/footer per section) is genuinely longer and
// differently ordered than `sections` — a wrapper that forwarded the entries would be indexable
// and plausible-looking, which is why the assertion below compares by IDENTITY.
const SECTIONS = [
  { title: 'A', data: ['a0', 'a1'] },
  { title: 'B', data: ['b0', 'b1'] },
];

// No .svelte-aware loader is wired into this repo's Vitest, so every .svelte component in the
// tree is pre-compiled to a sibling .mjs with its static import specifiers rewritten. The
// `.section-smoke-` prefix keeps these artifacts distinct from the other suites' temp files.
const COMPONENTS_DIR = join(__dirname, '..');
const VIEW_OUT = join(COMPONENTS_DIR, '.section-smoke-compiled-view.mjs');
const REFRESH_CONTROL_OUT = join(
  COMPONENTS_DIR,
  '.section-smoke-compiled-refresh-control.mjs',
);
const STICKY_HEADER_OUT = join(
  COMPONENTS_DIR,
  'scroll-view',
  '.section-smoke-compiled-sticky-header.mjs',
);
const LIST_OUT = join(
  COMPONENTS_DIR,
  'virtualized-list',
  '.section-smoke-compiled-virtualized-list.mjs',
);
const SECTION_LIST_OUT = join(
  __dirname,
  '.section-smoke-compiled-virtualized-section-list.mjs',
);
const WRAPPER_OUT = join(
  COMPONENTS_DIR,
  'section-list',
  '.section-smoke-compiled-section-list.mjs',
);
// Node's ESM import cache is keyed by resolved URL, so each root needs its own path or the second
// test would silently re-import the first one's module.
const ROOT_OUT = join(__dirname, '.section-smoke-compiled-root.mjs');
const WRAPPER_ROOT_OUT = join(
  __dirname,
  '.section-smoke-compiled-wrapper-root.mjs',
);

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

function compileSectionListTree(): void {
  compileToFile(
    readFileSync(join(COMPONENTS_DIR, 'View.svelte'), 'utf8'),
    'View.svelte',
    VIEW_OUT,
  );
  compileToFile(
    readFileSync(join(COMPONENTS_DIR, 'RefreshControl.svelte'), 'utf8'),
    'RefreshControl.svelte',
    REFRESH_CONTROL_OUT,
  );

  const stickyHeader = compile(
    readFileSync(
      join(COMPONENTS_DIR, 'scroll-view', 'sticky-header.svelte'),
      'utf8',
    ),
    { ...COMPILE_OPTIONS, filename: 'sticky-header.svelte' },
  ).js.code.replace(
    "from '../View.svelte'",
    "from '../.section-smoke-compiled-view.mjs'",
  );
  writeFileSync(STICKY_HEADER_OUT, stickyHeader);

  const list = compile(
    readFileSync(
      join(COMPONENTS_DIR, 'virtualized-list', 'index.svelte'),
      'utf8',
    ),
    { ...COMPILE_OPTIONS, filename: 'VirtualizedList.svelte' },
  )
    .js.code.replace(
      "from '../RefreshControl.svelte'",
      "from '../.section-smoke-compiled-refresh-control.mjs'",
    )
    .replace(
      "from '../scroll-view/sticky-header.svelte'",
      "from '../scroll-view/.section-smoke-compiled-sticky-header.mjs'",
    );
  writeFileSync(LIST_OUT, list);

  const sectionList = compile(
    readFileSync(join(__dirname, 'index.svelte'), 'utf8'),
    {
      ...COMPILE_OPTIONS,
      filename: 'VirtualizedSectionList.svelte',
    },
  ).js.code.replace(
    "from '../virtualized-list/index.svelte'",
    "from '../virtualized-list/.section-smoke-compiled-virtualized-list.mjs'",
  );
  writeFileSync(SECTION_LIST_OUT, sectionList);

  const wrapper = compile(
    readFileSync(join(COMPONENTS_DIR, 'section-list', 'index.svelte'), 'utf8'),
    { ...COMPILE_OPTIONS, filename: 'SectionList.svelte' },
  ).js.code.replace(
    "from '../virtualized-section-list/index.svelte'",
    "from '../virtualized-section-list/.section-smoke-compiled-virtualized-section-list.mjs'",
  );
  writeFileSync(WRAPPER_OUT, wrapper);
}

const CELL_SNIPPETS = `{#snippet cell({ item })}<symbiote-text p={{ text: 'row-' + item }}></symbiote-text>{/snippet}
     {#snippet sectionHeader({ section })}<symbiote-text p={{ text: 'head-' + section.title }}></symbiote-text>{/snippet}`;

async function loadRoot(
  source: string,
  filename: string,
  outPath: string,
): Promise<Component> {
  compileSectionListTree();
  compileToFile(source, filename, outPath);
  const mod: unknown = await import(`file://${outPath}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`${filename} produced no default export`);
  }
  return mod.default as Component;
}

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(VIEW_OUT, { force: true });
  rmSync(REFRESH_CONTROL_OUT, { force: true });
  rmSync(STICKY_HEADER_OUT, { force: true });
  rmSync(LIST_OUT, { force: true });
  rmSync(SECTION_LIST_OUT, { force: true });
  rmSync(WRAPPER_OUT, { force: true });
  rmSync(ROOT_OUT, { force: true });
  rmSync(WRAPPER_ROOT_OUT, { force: true });
});

// Mount, then report a real viewport so the windowing math runs off real geometry — the path that
// actually consults the fixed layout for every cell, not just the pre-layout bounded prefix.
async function mountAndLayout(root: Component, seen: unknown[]): Promise<void> {
  mount(ROOT_TAG, root, {
    sections: SECTIONS,
    getItemLayout: (data: unknown, index: number) => {
      seen.push(data);
      return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index };
    },
  });
  await tick();
  const scrollView = fabric.find(node => node.viewName === 'RCTScrollView');
  expect(scrollView, 'inner list committed a scroll view').toBeDefined();
  if (scrollView === undefined) return;
  fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
    layout: { width: 300, height: 600 },
  });
  await tick();
  await tick();
}

describe('VirtualizedSectionList getItemLayout (real compiled index.svelte)', () => {
  describe('Positive', () => {
    // why: RN hands its inner VirtualizedList `data={this.props.sections}`, so a user's
    // getItemLayout receives the SECTIONS. Ours streams the flattened entries as `data`, so
    // without the wrapper the very same callback would be handed a different first argument here
    // than on RN — silently, since the layout it returns still looks plausible.
    it('calls getItemLayout with the sections array, not the flattened entries', async () => {
      const seen: unknown[] = [];
      const root = await loadRoot(
        `<script>
           import VirtualizedSectionList from './.section-smoke-compiled-virtualized-section-list.mjs';
           let { sections, getItemLayout } = $props();
         </script>
         ${CELL_SNIPPETS}
         <VirtualizedSectionList {sections} {getItemLayout} item={cell} {sectionHeader} />`,
        'SectionRoot.svelte',
        ROOT_OUT,
      );

      await mountAndLayout(root, seen);

      expect(seen.length, 'getItemLayout was invoked').toBeGreaterThan(0);
      for (const data of seen) {
        expect(
          data,
          'getItemLayout receives the sections array by identity',
        ).toBe(SECTIONS);
      }
    });

    // why: forwarding here is prop-by-prop with no rest spread, so SectionList inheriting the
    // TYPE from VirtualizedSectionList proves nothing at runtime — a missing binding in its
    // template would drop the prop with no type error anywhere.
    it('relays getItemLayout through SectionList to the same sections argument', async () => {
      const seen: unknown[] = [];
      const root = await loadRoot(
        `<script>
           import SectionList from '../section-list/.section-smoke-compiled-section-list.mjs';
           let { sections, getItemLayout } = $props();
         </script>
         ${CELL_SNIPPETS}
         <SectionList {sections} {getItemLayout} item={cell} {sectionHeader} />`,
        'SectionListRoot.svelte',
        WRAPPER_ROOT_OUT,
      );

      await mountAndLayout(root, seen);

      expect(
        seen.length,
        'getItemLayout survived the SectionList relay',
      ).toBeGreaterThan(0);
      for (const data of seen) {
        expect(
          data,
          'getItemLayout receives the sections array by identity',
        ).toBe(SECTIONS);
      }
    });
  });
});
