// The CONTROL for the Angular fling measurement
// (adapters/angular/src/components/virtualized-list/scroll-cost.test.ts).
//
// Same geometry, same fling, same shared reducer: examples/angular's Benchmark sticky PATH B
// flattened to the entry stream VirtualizedList windows — 16 x (header + 32 rows + footer) = 544
// entries, getItemLayout, a 320px viewport, every virtualization prop at its RN default. Angular's
// per-frame numbers mean nothing without a column from an adapter that holds frame rate on the same
// screen; this file is that column.
//
// Everything here is an operation COUNT. Wall clock does not survive the trip to Hermes.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { readCommitProfile } from '@symbiote-native/engine';
import {
  subscribeListDiagnostics,
  type IListDiagnosticFrame,
} from '@symbiote-native/components';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import { VirtualizedList } from './index';

const ROOT_TAG = 831;
const SCROLL_VIEW = 'RCTScrollView';
const ENTRY_COUNT = 544;
const ENTRIES_PER_SECTION = 34;
const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 28;
const SECTION_EXTENT = HEADER_HEIGHT + 32 * ROW_HEIGHT;
const VIEWPORT = 320;
const FLING_STEP = 120;
const FLING_FRAMES = 20;
// Past the (21-1)/2 * 320 = 3200px overscan, so the window SLIDES instead of growing.
const FLING_START = 6000;

const fabric = installFabric();
const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 55));

// Pump the incremental fill until the committed window reaches target, then stop - a fixed step
// count would have to assume the worst case and every extra 55ms tick lands on the whole suite.
async function fillToTarget(frames: IListDiagnosticFrame[]): Promise<void> {
  for (let step = 0; step < 120; step += 1) {
    const frame = frames[frames.length - 1];
    if (
      frame !== undefined &&
      frame.first <= frame.targetFirst &&
      frame.last >= frame.targetLast
    )
      return;
    const before = frames.length;
    await settle();
    if (frames.length === before) return;
  }
}

interface IEntry {
  id: string;
}

const ENTRIES: IEntry[] = Array.from({ length: ENTRY_COUNT }, (_v, index) => ({
  id: `e${index}`,
}));

function pathBLayout(
  _data: unknown,
  index: number,
): { length: number; offset: number; index: number } {
  const section = Math.floor(index / ENTRIES_PER_SECTION);
  const within = index - section * ENTRIES_PER_SECTION;
  const sectionOffset = section * SECTION_EXTENT;
  if (within === 0)
    return { length: HEADER_HEIGHT, offset: sectionOffset, index };
  if (within === ENTRIES_PER_SECTION - 1)
    return { length: 0, offset: sectionOffset + SECTION_EXTENT, index };
  return {
    length: ROW_HEIGHT,
    offset: sectionOffset + HEADER_HEIGHT + (within - 1) * ROW_HEIGHT,
    index,
  };
}

// The Solid twin of Angular's outletCreates + outletUpdates: how many times per frame the
// per-cell view function runs at all. Solid runs a row body ONCE per key, so a sliding window
// costs only the rows that entered it — the whole point of the control.
let renderItemCalls = 0;

function flatCommitted(): IFakeNode[] {
  const flat: IFakeNode[] = [];
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      flat.push(node);
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return flat;
}

function scrollHost(): IFakeNode {
  const node = flatCommitted().find(
    candidate => candidate.viewName === SCROLL_VIEW,
  );
  if (node === undefined) throw new Error('no scroll host committed');
  return node;
}

beforeEach(() => {
  fabric.reset();
  renderItemCalls = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('CONTROL: the cost of a FLING frame on PATH B geometry (Solid)', () => {
  it('prices one window-moving scroll frame in operations', async () => {
    mount(ROOT_TAG, () => (
      <VirtualizedList
        testID="vlist-fling-host"
        data={ENTRIES}
        getItem={(data: unknown, index: number): IEntry =>
          (data as IEntry[])[index] ?? ENTRIES[0]!
        }
        getItemCount={(): number => ENTRY_COUNT}
        keyExtractor={(item: IEntry): string => item.id}
        getItemLayout={pathBLayout}
        scrollEventThrottle={16}
        renderItem={(info: () => { item: IEntry }) => {
          renderItemCalls += 1;
          const label = info().item.id;
          return (
            <symbiote-view>
              <symbiote-text>{label}</symbiote-text>
            </symbiote-view>
          );
        }}
      />
    ));
    await flush();

    const host = scrollHost().instanceHandle;
    fabric.fireEvent(host, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });
    await flush();
    const frames: IListDiagnosticFrame[] = [];
    const stop = subscribeListDiagnostics({
      onFrame: frame => frames.push(frame),
    });
    fabric.fireEvent(host, 'topScroll', {
      contentOffset: { x: 0, y: FLING_START },
    });
    await flush();
    await fillToTarget(frames);

    frames.length = 0;
    readCommitProfile();
    renderItemCalls = 0;

    let offset = FLING_START;
    for (let frame = 0; frame < FLING_FRAMES; frame += 1) {
      offset += FLING_STEP;
      fabric.fireEvent(host, 'topScroll', {
        contentOffset: { x: 0, y: offset },
      });
      await flush();
    }
    stop();

    const commit = readCommitProfile();
    const widths = frames.map(frame => frame.last - frame.first + 1);
    const meanWidth =
      widths.reduce((sum, width) => sum + width, 0) /
      Math.max(1, widths.length);
    const per = (value: number): string => (value / FLING_FRAMES).toFixed(1);

    writeFileSync(
      process.env['SYMBIOTE_FLING_REPORT_SOLID'] ?? '/dev/null',
      [
        `SOLID (control) fling, ${FLING_FRAMES} frames of ${FLING_STEP}px over ${ENTRY_COUNT} entries`,
        `  per frame: cellBodyRuns=${per(renderItemCalls)}`,
        `  per frame: engine commits=${per(commit.commits)} nodesVisited=${per(commit.nodesVisited)} ` +
          `propWrites=${per(commit.propWrites)} propNoops=${per(commit.propNoops)} ` +
          `childScans=${per(commit.childScans)} childFlattens=${per(commit.childFlattens)}`,
        `  per frame: deriveMetrics=${per(frames.length)} windowWidth=${meanWidth.toFixed(1)} ` +
          `cellsRebuilt=${per(frames.length * meanWidth)}`,
        '',
      ].join('\n'),
    );

    // >=, not ==: a batch-fill timer can land inside the burst under a loaded run.
    expect(
      frames.length,
      'the fling must move the window',
    ).toBeGreaterThanOrEqual(FLING_FRAMES);
    // The control's own claim, so it cannot silently stop being a control: a keyed window runs a
    // cell body only for the cells that ENTERED it (~4 of 233 per frame), never for the window.
    expect(
      renderItemCalls / FLING_FRAMES,
      'a keyed window must run a cell body only for the cells that entered it',
    ).toBeLessThan(meanWidth / 10);
  });
});
