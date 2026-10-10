// Real-execution proof (not just typecheck) that a user's `getItemLayout` reaches the shared
// windowing machinery WITH THE SECTIONS ARRAY, through both public entry points —
// VirtualizedSectionList directly and SectionList's prop-by-prop relay. Same harness shape as
// virtualized-list.smoke.test.ts: compile the REAL .svelte sources through svelte/compiler,
// co-locate each compiled file next to its real sibling (its own imports resolve relative to
// where it lands), installRecordingFabric(), mount for real.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import type { ISeparators } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
  payloadOf,
} from '@symbiote-native/test-utils';
// See scroll-view.smoke.test.ts: mounting through `../../render` skips `index.ts`, so the host
// behaviors have to be named here.
import '../../register';
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
const LIST_OUT = join(
  COMPONENTS_DIR,
  'virtualized-list',
  '.section-smoke-compiled-virtualized-list.mjs',
);
const SECTION_LIST_OUT = join(
  __dirname,
  '.section-smoke-compiled-virtualized-section-list.mjs',
);
const SECTION_CELL_OUT = join(
  __dirname,
  '.section-smoke-compiled-section-item-cell.mjs',
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
const CLIPPED_ROOT_OUT = join(
  __dirname,
  '.section-smoke-compiled-clipped-root.mjs',
);
const SEPARATOR_ROOT_OUT = join(
  __dirname,
  '.section-smoke-compiled-separator-root.mjs',
);
const OVERRIDE_ROOT_OUT = join(
  __dirname,
  '.section-smoke-compiled-override-root.mjs',
);

const HIGHLIGHT_ROOT_OUT = join(
  __dirname,
  '.section-smoke-compiled-highlight-root.mjs',
);

function isSeparators(value: unknown): value is ISeparators {
  return (
    typeof value === 'object' &&
    value !== null &&
    'highlight' in value &&
    typeof value.highlight === 'function' &&
    'unhighlight' in value &&
    typeof value.unhighlight === 'function' &&
    'updateProps' in value &&
    typeof value.updateProps === 'function'
  );
}

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
    readFileSync(
      join(COMPONENTS_DIR, 'virtualized-list', 'index.svelte'),
      'utf8',
    ),
    'VirtualizedList.svelte',
    LIST_OUT,
  );

  const sectionList = compile(
    readFileSync(join(__dirname, 'index.svelte'), 'utf8'),
    {
      ...COMPILE_OPTIONS,
      filename: 'VirtualizedSectionList.svelte',
    },
  )
    .js.code.replace(
      "from '../virtualized-list/index.svelte'",
      "from '../virtualized-list/.section-smoke-compiled-virtualized-list.mjs'",
    )
    .replace(
      "from './section-item-cell.svelte'",
      "from './.section-smoke-compiled-section-item-cell.mjs'",
    );
  writeFileSync(SECTION_LIST_OUT, sectionList);
  compileToFile(
    readFileSync(join(__dirname, 'section-item-cell.svelte'), 'utf8'),
    'SectionItemCell.svelte',
    SECTION_CELL_OUT,
  );

  const wrapper = compile(
    readFileSync(join(COMPONENTS_DIR, 'section-list', 'index.svelte'), 'utf8'),
    { ...COMPILE_OPTIONS, filename: 'SectionList.svelte' },
  ).js.code.replace(
    "from '../virtualized-section-list/index.svelte'",
    "from '../virtualized-section-list/.section-smoke-compiled-virtualized-section-list.mjs'",
  );
  writeFileSync(WRAPPER_OUT, wrapper);
}

const CELL_SNIPPETS = `{#snippet cell({ item })}<text p={{ text: 'row-' + item }}></text>{/snippet}
     {#snippet sectionHeader({ section })}<text p={{ text: 'head-' + section.title }}></text>{/snippet}`;

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

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(LIST_OUT, { force: true });
  rmSync(SECTION_LIST_OUT, { force: true });
  rmSync(SECTION_CELL_OUT, { force: true });
  rmSync(WRAPPER_OUT, { force: true });
  rmSync(ROOT_OUT, { force: true });
  rmSync(WRAPPER_ROOT_OUT, { force: true });
  rmSync(CLIPPED_ROOT_OUT, { force: true });
  rmSync(SEPARATOR_ROOT_OUT, { force: true });
  rmSync(OVERRIDE_ROOT_OUT, { force: true });
  rmSync(HIGHLIGHT_ROOT_OUT, { force: true });
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
    // RN hands its inner list `data={this.props.sections}`, so `getItemLayout` gets the sections
    // while ours streams the flattened entries, a wrapper has to swap them back
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

    // The relay is prop-by-prop, so a missing binding would drop the prop with no type error
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

    // RN's SectionList spreads every prop down to its ScrollView, here a missing binding drops it
    it('relays removeClippedSubviews through SectionList to the scroll view', async () => {
      const root = await loadRoot(
        `<script>
           import SectionList from '../section-list/.section-smoke-compiled-section-list.mjs';
           let { sections } = $props();
         </script>
         ${CELL_SNIPPETS}
         <SectionList {sections} item={cell} {sectionHeader} removeClippedSubviews={true} />`,
        'ClippedSectionListRoot.svelte',
        CLIPPED_ROOT_OUT,
      );

      mount(ROOT_TAG, root, { sections: SECTIONS });
      await tick();

      const scrollView = fabric
        .findAll(node => node.viewName === 'RCTScrollView')
        .at(-1);
      expect(scrollView, 'inner list committed a scroll view').toBeDefined();
      if (scrollView === undefined) return;
      expect(payloadOf(scrollView.handle).removeClippedSubviews).toBe(true);
    });
  });

  // RN paints separators inside the item cell (`ItemWithSeparator`), not as cells of their own
  describe('separators', () => {
    const live = createLiveTree(fabric);

    async function streamOf(
      root: Component,
      props: Record<string, unknown> = {},
    ): Promise<string[]> {
      mount(ROOT_TAG, root, { sections: SECTIONS, ...props });
      await tick();
      const scrollView = fabric.find(node => node.viewName === 'RCTScrollView');
      if (scrollView !== undefined) {
        fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
          layout: { width: 300, height: 2_000 },
        });
      }
      await tick();
      await tick();
      return paintedTexts();
    }

    function paintedTexts(): string[] {
      const texts: string[] = [];
      live.walkLive(live.appRoot(), node => {
        const text = payloadOf(node.handle).text;
        if (typeof text === 'string') texts.push(text);
      });
      return texts;
    }

    // `highlight()` of a cell also lights the trailing separator of the cell before it
    it('lights the separator of the cell before on highlight and routes a leading updateProps to it', async () => {
      const grabbed = new Map<string, unknown>();
      const root = await loadRoot(
        `<script>
           import VirtualizedSectionList from './.section-smoke-compiled-virtualized-section-list.mjs';
           let { sections, grab } = $props();
         </script>
         {#snippet cell({ item, separators })}{@const mark = grab(item, separators)}<text p={{ text: 'row-' + item + mark }}></text>{/snippet}
         {#snippet sep({ highlighted, tint })}<text p={{ text: (highlighted ? 'lit' : 'sep') + (tint ?? '') }}></text>{/snippet}
         <VirtualizedSectionList {sections} item={cell} separator={sep} />`,
        'HighlightRoot.svelte',
        HIGHLIGHT_ROOT_OUT,
      );
      await streamOf(root, {
        grab: (key: string, value: unknown) => {
          grabbed.set(key, value);
          return '';
        },
      });
      const second = grabbed.get('a1');
      if (!isSeparators(second)) throw new Error('a1 handed no separators');

      second.highlight();
      await tick();
      await tick();
      expect(paintedTexts().slice(0, 3)).toEqual(['row-a0', 'lit', 'row-a1']);

      second.unhighlight();
      second.updateProps('leading', { tint: '!' });
      await tick();
      await tick();
      expect(paintedTexts().slice(0, 3)).toEqual(['row-a0', 'sep!', 'row-a1']);
    });

    it('paints section separators around the items and item separators between them', async () => {
      const root = await loadRoot(
        `<script>
           import VirtualizedSectionList from './.section-smoke-compiled-virtualized-section-list.mjs';
           let { sections } = $props();
         </script>
         ${CELL_SNIPPETS}
         {#snippet sep()}<text p={{ text: 'sep' }}></text>{/snippet}
         {#snippet sectionSep()}<text p={{ text: 'section-sep' }}></text>{/snippet}
         <VirtualizedSectionList {sections} item={cell} {sectionHeader} separator={sep} sectionSeparator={sectionSep} />`,
        'SeparatorRoot.svelte',
        SEPARATOR_ROOT_OUT,
      );

      expect(await streamOf(root)).toEqual([
        'head-A',
        'section-sep',
        'row-a0',
        'sep',
        'row-a1',
        'section-sep',
        'head-B',
        'section-sep',
        'row-b0',
        'sep',
        'row-b1',
        'section-sep',
      ]);
    });

    it('lets a section bring its own item snippet and separator', async () => {
      const root = await loadRoot(
        `<script>
           import VirtualizedSectionList from './.section-smoke-compiled-virtualized-section-list.mjs';
           let { sections: base } = $props();
           const sections = [{ ...base[0], item: custom, separator: customSep }, base[1]];
         </script>
         ${CELL_SNIPPETS}
         {#snippet custom({ item })}<text p={{ text: 'custom-' + item }}></text>{/snippet}
         {#snippet customSep()}<text p={{ text: 'custom-sep' }}></text>{/snippet}
         {#snippet sep()}<text p={{ text: 'sep' }}></text>{/snippet}
         <VirtualizedSectionList {sections} item={cell} separator={sep} />`,
        'OverrideRoot.svelte',
        OVERRIDE_ROOT_OUT,
      );

      expect(await streamOf(root)).toEqual([
        'custom-a0',
        'custom-sep',
        'custom-a1',
        'row-b0',
        'sep',
        'row-b1',
      ]);
    });
  });
});
