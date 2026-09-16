// Proves the sticky-header force-mount fix (buildListPlan's forcedStickyCell/gapExtent),
// mirroring adapters/react/src/components/virtualized-list/virtualized-list-sticky-forced-cell.test.tsx:
// stock RN's VirtualizedList windows cell rendering to [first,last] but ALWAYS force-mounts the
// nearest sticky index below that window (VirtualizedList.js _ensureClosestStickyHeader), so a
// pinned section header stays mounted after scrolling carries its origin position off-screen.
// Before the fix, VirtualizedList's recomputeView never read plan.forcedStickyCell/gapExtent at
// all, so the header at index 0 was silently dropped the moment the window moved past it —
// destroyed and recreated (losing its measured layout, flickering) every time the window slid
// back over it. windowSize=1 zeroes the overscan so a modest scroll genuinely pushes index 0 out
// of [first,last], isolating the force-mount behavior from normal windowing.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { childrenOf, type ISymbioteNode } from '@symbiote-native/engine';
import {
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

// registerScrollViewBehavior() is what builds the content container the sticky projection lands
// on — the tag has no content node of its own without it.
import '../../register';
import { mount, unmount } from '../../render';
import { VirtualizedList } from './index';
import { VListItemDirective } from './directives';

const ROOT_TAG = 977;
const ITEM_HEIGHT = 100;
const VIEWPORT = 100;

interface IRow {
  id: number;
}

const rows: IRow[] = Array.from({ length: 20 }, (_unused, index) => ({
  id: index,
}));

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'symbiote-virtualized-list-sticky-forced-cell-host',
  standalone: true,
  imports: [VirtualizedList, VListItemDirective],
  template: `
    <VirtualizedList
      [data]="rows"
      [getItem]="getItem"
      [getItemCount]="getItemCount"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
      [windowSize]="1"
      [stickyHeaderIndices]="stickyHeaderIndices"
    >
      <ng-template vListItem let-item>
        <text [testID]="'row-' + item.id">{{ 'row-' + item.id }}</text>
      </ng-template>
    </VirtualizedList>
  `,
})
class StickyForcedCellHost {
  rows = rows;
  stickyHeaderIndices = [0, 10];
  getItem = (data: readonly IRow[], index: number): IRow => data[index];
  getItemCount = (data: readonly IRow[]): number => data.length;
  keyExtractor = (item: IRow): string => `k-${item.id}`;
  getItemLayout = (
    _data: unknown,
    index: number,
  ): { length: number; offset: number; index: number } => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  });
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findScrollView(): IAuthoredNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  expect(node, 'the scroll view was created').toBeDefined();
  if (node === undefined) throw new Error('unreachable: scroll view missing');
  return node;
}

function testIdOf(handle: ISymbioteNode): unknown {
  return fabric.find(one => one.handle === handle)?.props.testID;
}

// RESIDENCY is the whole subject, so every walk here descends the LIVE child links from the scroll
// view down. A recording keeps every node it ever saw created, so a windowed-out cell is still in
// the record — searching the record instead would report index 1 as resident forever.
function renderedRows(handle: ISymbioteNode): string[] {
  const found: string[] = [];
  for (const child of childrenOf(handle)) {
    const testID = testIdOf(child);
    if (typeof testID === 'string' && testID.startsWith('row-'))
      found.push(testID);
    found.push(...renderedRows(child));
  }
  return found;
}

// Ancestor depth below the scroll view of the first node carrying the given testID, or undefined
// when absent. Only the DIFFERENCE between two depths is read, so the origin does not matter —
// what matters is that both are measured from the same one. Used to detect the extra
// sticky-wrapper host node; see the "wraps the forced cell" test below.
function depthOf(
  handle: ISymbioteNode,
  testID: string,
  depth = 0,
): number | undefined {
  for (const child of childrenOf(handle)) {
    if (testIdOf(child) === testID) return depth;
    const found = depthOf(child, testID, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

async function scrollPastSection(): Promise<void> {
  fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
  });
  await tick();
  // Scroll so the window covers index 5 only (offsets[5..6] = 500..700 straddle 550..650 with
  // windowSize=1's zero overscan) — index 0 and its sticky section origin are well outside
  // [first,last].
  fabric.fireEvent(findScrollView().instanceHandle, 'topScroll', {
    contentOffset: { x: 0, y: 550 },
    contentSize: { width: 320, height: ITEM_HEIGHT * rows.length },
    layoutMeasurement: { width: 320, height: VIEWPORT },
  });
  await tick();
  await tick();
}

// No Negative group: this is a render-tree assertion over the Angular adapter's consumption of
// `plan.forcedStickyCell` (index.ts's recomputeView + buildWindowCell), not a guard clause — there
// is no invalid input for buildListPlan's caller to reject here, only a windowing/wrapping outcome
// to prove correct. Both scenarios below are Positive.
describe('VirtualizedList force-mounts the sticky header below the window', () => {
  // why: regression coverage for a0ad319 ("keep sticky headers correct when a cell is
  // force-rendered") — before the fix, recomputeView never read plan.forcedStickyCell/gapExtent,
  // so a pinned header whose origin index scrolled out of [first,last] was torn down and rebuilt
  // (losing measured layout, flickering) every time the window slid back over it, instead of
  // staying resident the way RN's own VirtualizedList._ensureClosestStickyHeader keeps it.
  it('keeps the sticky index-0 cell mounted after scrolling its origin position off-window', async () => {
    mount(ROOT_TAG, StickyForcedCellHost);
    await tick();
    await tick();
    findScrollView(); // sanity: the inner ScrollView committed.

    await scrollPastSection();

    const rendered = renderedRows(findScrollView().handle);
    // The forced sticky cell: index 0 stays mounted even though it is far outside the in-window
    // range.
    expect(
      rendered.includes('row-0'),
      'sticky header at index 0 stays force-mounted',
    ).toBe(true);
    // Real windowing still holds for everything else: indices strictly between the forced sticky
    // cell and the window are NOT rendered.
    expect(rendered.includes('row-1'), 'index 1 stays windowed out').toBe(
      false,
    );
    expect(rendered.includes('row-4'), 'index 4 stays windowed out').toBe(
      false,
    );
    // The window itself is resident.
    expect(
      rendered.includes('row-5') || rendered.includes('row-6'),
      'window cell resident',
    ).toBe(true);
  });

  // why: the forced cell is a SEPARATE render branch from the windowed `@for` loop (index.ts
  // template), so it is not automatically covered by ScrollView's sticky-wrapping nodeTransform —
  // that wrapping has to be proven explicitly for the forced branch too, or a force-mounted header
  // would render unstyled/unpinned even though the fix above keeps it merely present.
  it('wraps the forced cell in the sticky-header projection, same as an in-window sticky cell', async () => {
    mount(ROOT_TAG, StickyForcedCellHost);
    await tick();
    await tick();

    await scrollPastSection();

    // Angular's ScrollView doesn't forward stickyHeaderIndices as a prop on the native scroll
    // node — it auto-wraps the projected child at that position (projection.ts's
    // reconcileStickyRecords) in an extra host node, exactly as an in-window sticky cell is
    // wrapped. Prove the forced cell gets the SAME treatment structurally: it must sit one
    // ancestor level deeper than an ordinary windowed cell (row-5, not sticky), because the
    // sticky wrapper interposes between the ScrollView content and the cell.
    const scroll = findScrollView().handle;
    const forcedDepth = depthOf(scroll, 'row-0');
    const windowedDepth = depthOf(scroll, 'row-5');
    expect(forcedDepth, 'forced sticky cell (row-0) found').toBeDefined();
    expect(windowedDepth, 'ordinary windowed cell (row-5) found').toBeDefined();
    expect(forcedDepth).toBe((windowedDepth ?? 0) + 1);
  });
});
