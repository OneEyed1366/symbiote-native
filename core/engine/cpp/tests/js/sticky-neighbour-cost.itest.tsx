// What a commit pays for a STICKY neighbour it never touched.
//
// why: `surface-width-cost.itest.ts` answered the width question and answered it NO — 800 inert
// siblings cost nothing. But inert is the word that mattered, and it is not what the device screen
// holds: `examples/*/screens/BenchmarkScreen` mounts a scroll view with `stickyHeaderIndices` over
// ~800 children, and the sticky behavior is the only code in this repo outside the Vue, Angular and
// Solid renderers that READS the tree (`core/components/src/behaviors/scroll-view/sticky.ts`,
// four `childrenOf` sites, one of them a recursive depth-first walk).
//
// A read is a batch boundary. So the question this file asks is not how wide the screen is but how
// many times the buffer has to be drained to answer a neighbour's questions — which is why it reads
// CROSSINGS beside the wall, and why the width fixture could not have found this.
//
// The product rule: **a commit's cost is a function of what changed.** A neighbour that did not
// change should not turn one crossing into hundreds.
//
// RUN ON `build-release` (`pnpm run bench:itest`). The assert build's list append is O(N^2).

import { createElement as h, memo, useState } from 'react';

import { readCommitProfile } from '@symbiote-native/engine';
import { mount, SectionList } from '@symbiote-native/react';

import { CELL_STYLE, INPUT_STYLE, ROOT_TAG, ROW_STYLE } from './bench-suite';
import { describe, expect, flushTimers, it, print, report } from './harness';

const ROWS = 1_000;
// 200 sections of a header plus three rows, flattened into one scroll view — the shape
// `StickyScrollViewBlock` builds on every benchmark screen.
const STICKY_SECTIONS = 200;
const STICKY_ROWS_PER_SECTION = 3;
const STICKY_CHILDREN = STICKY_SECTIONS * (1 + STICKY_ROWS_PER_SECTION);

// Sticky path B, the screen's other one: a `SectionList` with `stickySectionHeadersEnabled`, i.e.
// VirtualizedSectionList over VirtualizedList. Same counts as the screen's.
const SECTION_COUNT = 16;
const SECTION_ROWS = 32;
const SECTION_ROW_HEIGHT = 30;
const SECTION_HEADER_HEIGHT = 28;
const SECTION_ENTRIES = 1 + SECTION_ROWS + 1;
const SECTION_EXTENT =
  SECTION_HEADER_HEIGHT + SECTION_ROWS * SECTION_ROW_HEIGHT;

const SECTIONS = Array.from({ length: SECTION_COUNT }, (_value, section) => ({
  title: `SECTION ${section + 1}`,
  data: Array.from({ length: SECTION_ROWS }, (_rowValue, row) => ({
    id: `s${section}-r${row}`,
    label: `row ${section + 1}.${row + 1}`,
  })),
}));

/**
 * `sectionListItemLayout` from the screen, verbatim in shape: the index is FLAT over the whole
 * stream, so it is decoded back into "which section, and what within it".
 */
function sectionItemLayout(
  _sections: unknown,
  index: number,
): { length: number; offset: number; index: number } {
  const section = Math.floor(index / SECTION_ENTRIES);
  const within = index - section * SECTION_ENTRIES;
  const offset = section * SECTION_EXTENT;
  if (within === 0) {
    return { length: SECTION_HEADER_HEIGHT, offset, index };
  }
  if (within === SECTION_ENTRIES - 1) {
    return { length: 0, offset: offset + SECTION_EXTENT, index };
  }
  return {
    length: SECTION_ROW_HEIGHT,
    offset: offset + SECTION_HEADER_HEIGHT + (within - 1) * SECTION_ROW_HEIGHT,
    index,
  };
}

const Row = memo(function RowView({
  id,
}: {
  id: number;
}): ReturnType<typeof h> {
  const label = (text: string): ReturnType<typeof h> =>
    h('text', { ellipsizeMode: 'tail' }, text);

  return h(
    'view',
    { style: ROW_STYLE, testID: `row-${id}` },
    label(String(id)),
    h('view', { style: CELL_STYLE }, label(`row ${id}`)),
    h('view', { style: CELL_STYLE }, label('x')),
    h('text-input', { style: INPUT_STYLE, text: `row ${id}` }),
  );
});

/** The screen's sticky block: one scroll view, every fourth child flagged as a header. */
function stickyBlock(): ReturnType<typeof h> {
  const children = [];
  const indices = [];
  for (let section = 0; section < STICKY_SECTIONS; section += 1) {
    indices.push(children.length);
    children.push(h('text', { key: `h-${section}` }, `SECTION ${section + 1}`));
    for (let row = 0; row < STICKY_ROWS_PER_SECTION; row += 1) {
      children.push(h('text', { key: `r-${section}-${row}` }, `row ${row}`));
    }
  }
  return h(
    'scroll-view',
    { stickyHeaderIndices: indices, style: { height: 320 } },
    ...children,
  );
}

let apply: ((ids: readonly number[]) => void) | undefined;

/** `SectionList` with sticky headers — the screen's second sticky path. */
function sectionListBlock(): ReturnType<typeof h> {
  return h(SectionList, {
    sections: SECTIONS,
    keyExtractor: (item: { id: string }) => item.id,
    stickySectionHeadersEnabled: true,
    getItemLayout: sectionItemLayout,
    style: { height: 320 },
    renderSectionHeader: ({ section }: { section: { title: string } }) =>
      h('text', { style: { height: SECTION_HEADER_HEIGHT } }, section.title),
    renderItem: ({ item }: { item: { label: string } }) =>
      h(
        'view',
        { style: { height: SECTION_ROW_HEIGHT } },
        h('text', null, item.label),
      ),
  });
}

type INeighbour = 'none' | 'sticky' | 'section-list';

function neighbourOf(kind: INeighbour): ReturnType<typeof h> | null {
  if (kind === 'sticky') return stickyBlock();
  if (kind === 'section-list') return sectionListBlock();
  return null;
}

/**
 * The screen: the neighbour, then the list the benchmark fills.
 *
 * STATEFUL rather than two mounts, and that is the whole shape of the measurement: the neighbour has
 * to be mounted, committed and SETTLED before the timed step, so what the clock sees is a steady
 * commit beside it — which is the benchmark step's own situation. A second `mount` on the same root
 * tag tears the neighbour down and rebuilds it, and would time that instead.
 */
function Screen({
  neighbour,
}: {
  neighbour: INeighbour;
}): ReturnType<typeof h> {
  const [ids, setIds] = useState<readonly number[]>([]);
  apply = setIds;
  return h(
    'view',
    { style: { flex: 1 } },
    neighbourOf(neighbour),
    h(
      'view',
      { style: { flex: 1 } },
      ...ids.map(id => h(Row, { key: id, id })),
    ),
  );
}

function timeArm(
  label: string,
  neighbour: INeighbour,
): { wall: number; created: number; crossings: number } {
  const surface = mount(ROOT_TAG, h(Screen, { neighbour }));
  flushTimers();
  surface.commit();
  // Settled: the neighbour is standing, its behavior has run, and anything it queued has drained.
  // Without this the clock below would time the neighbour's own mount.
  flushTimers();
  surface.commit();
  if (apply === undefined) throw new Error('the screen never rendered');

  const ids = [];
  for (let id = 0; id < ROWS; id += 1) ids.push(id);

  readCommitProfile();
  const startedAt = performance.now();
  apply(ids);
  flushTimers();
  surface.commit();
  const wall = performance.now() - startedAt;

  const profile = readCommitProfile();
  print(
    `DEBUG ${label.padEnd(10)} wall=${wall.toFixed(1)} ms · created=${profile.nodesCreated} ` +
      `writes=${profile.propWrites} crossings=${profile.applyCalls}`,
  );
  return {
    wall,
    created: profile.nodesCreated,
    crossings: profile.applyCalls,
  };
}

let alone: ReturnType<typeof timeArm> | undefined;

describe('what a commit pays for a sticky neighbour it did not touch', () => {
  // why: the shape every headless arm has — the list and nothing else beside it.
  it('commits a thousand rows with no sticky neighbour', () => {
    alone = timeArm('alone', 'none');

    // The architectural claim, and the tripwire: a whole create is a fixed number of entries into
    // C++, not one per mutation.
    expect(alone.crossings).toBe(2);
  });

  // why: the shape the device screen has. Same rows, same writes — the only difference is a
  // committed neighbour whose behavior asks the tree questions.
  it('commits the same thousand rows beside a sticky scroll view', () => {
    const beside = timeArm('sticky', 'sticky');

    if (alone === undefined) throw new Error('the lone arm did not run');

    const delta = beside.wall - alone.wall;
    print(
      `DEBUG COST      alone=${alone.wall.toFixed(1)} sticky=${beside.wall.toFixed(1)} ms · ` +
        `the neighbour costs ${delta.toFixed(1)} ms and ` +
        `${beside.crossings - alone.crossings} extra crossings for ${STICKY_CHILDREN} children`,
    );

    // The finding, either way: a neighbour that changed nothing must not multiply the crossings.
    // Left as an assertion rather than a print because a regression here is invisible to every
    // other counter in this directory — same tree, same writes, more entries.
    expect(beside.crossings).toBe(2);
  });

  // why: the screen's OTHER sticky path, and the more expensive shape on paper — a
  // `VirtualizedSectionList` over a `VirtualizedList`, which runs its own bookkeeping per commit
  // rather than resolving a static index array. The plain sticky block cost ~10 ms; this is the
  // half of the screen that block does not stand for.
  it('commits the same thousand rows beside a sticky SectionList', () => {
    const beside = timeArm('sectionlist', 'section-list');

    if (alone === undefined) throw new Error('the lone arm did not run');

    const delta = beside.wall - alone.wall;
    print(
      `DEBUG COST      alone=${alone.wall.toFixed(1)} sectionlist=${beside.wall.toFixed(1)} ms · ` +
        `the neighbour costs ${delta.toFixed(1)} ms and ` +
        `${beside.crossings - alone.crossings} extra crossings for ` +
        `${SECTION_COUNT * SECTION_ROWS} rows`,
    );

    expect(beside.crossings).toBe(2);
  });
});

report();
