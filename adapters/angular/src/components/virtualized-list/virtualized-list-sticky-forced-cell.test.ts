// RN force-mounts the nearest sticky index above the window, so a pinned header stays mounted
// `windowSize=1` zeroes the overscan and `initialNumToRender=1` retains only row 0
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { childrenOf, type ISymbioteNode } from '@symbiote-native/engine';
import {
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

import '../../register';
import { mount, unmount } from '../../render';
import { VirtualizedList } from './index';
import { VListItemDirective } from './directives';

const ROOT_TAG = 977;
const ITEM_HEIGHT = 100;
const VIEWPORT = 100;
const STICKY_ORIGIN = 'row-2';

type IRow = {
  id: number;
};

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
      [initialNumToRender]="1"
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
  stickyHeaderIndices = [2, 10];
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

// The walk follows the LIVE child links, the recording keeps every node ever created
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

// The tag the host was told for the cell holding `testID`, a plain view registers none
function cellTagFor(handle: ISymbioteNode, testID: string): string | undefined {
  for (const child of childrenOf(handle)) {
    if (testIdOf(child) === testID)
      return fabric.find(one => one.handle === handle)?.tagName;
    const found = cellTagFor(child, testID);
    if (found !== undefined) return found;
  }
  return undefined;
}

// Depth below the scroll view of the first node with `testID`, only differences matter
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

// Scrolls so the window covers index 5 only, rows 1..4 fall outside it
async function scrollPastSection(): Promise<void> {
  fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
  });
  await tick();
  fabric.fireEvent(findScrollView().instanceHandle, 'topScroll', {
    contentOffset: { x: 0, y: 550 },
    contentSize: { width: 320, height: ITEM_HEIGHT * rows.length },
    layoutMeasurement: { width: 320, height: VIEWPORT },
  });
  await tick();
  await tick();
}

describe('VirtualizedList force-mounts the sticky header above the window', () => {
  // The header leaves the window but stays resident instead of being rebuilt on every slide back
  it('keeps the sticky origin mounted after scrolling it off-window', async () => {
    mount(ROOT_TAG, StickyForcedCellHost);
    await tick();
    await tick();
    findScrollView();

    await scrollPastSection();

    const rendered = renderedRows(findScrollView().handle);
    expect(
      rendered.includes(STICKY_ORIGIN),
      'the sticky header stays force-mounted',
    ).toBe(true);
    expect(rendered.includes('row-0'), 'the initial region is retained').toBe(
      true,
    );
    expect(rendered.includes('row-1'), 'index 1 stays windowed out').toBe(
      false,
    );
    expect(rendered.includes('row-4'), 'index 4 stays windowed out').toBe(
      false,
    );
    expect(
      rendered.includes('row-5') || rendered.includes('row-6'),
      'window cell resident',
    ).toBe(true);
  });

  // The forced cell is an ordinary row of the plan, so it pins like an in-window sticky cell
  it('gives the forced cell the sticky-header tag, same as an in-window sticky cell', async () => {
    mount(ROOT_TAG, StickyForcedCellHost);
    await tick();
    await tick();

    await scrollPastSection();

    const scroll = findScrollView().handle;

    expect(
      cellTagFor(scroll, STICKY_ORIGIN),
      'the forced sticky cell pins',
    ).toBe('sticky-header');
    // An empty string is the witness for "does not pin", a plain view registers no tag
    expect(
      cellTagFor(scroll, 'row-5'),
      'an ordinary windowed cell does not pin',
    ).toBe('');
    expect(depthOf(scroll, STICKY_ORIGIN)).toBe(depthOf(scroll, 'row-5'));
  });

  // Paint children shift as the window slides, so the cell carries the `sticky-header` tag
  // and no indices reach the scroll view
  it('pins by tag and hands the scroll view no sticky indices', async () => {
    mount(ROOT_TAG, StickyForcedCellHost);
    await tick();
    await tick();
    await scrollPastSection();

    const tagged = fabric.findAll(one => one.tagName === 'sticky-header');

    expect(
      tagged.length,
      'the sticky cells commit under the tag',
    ).toBeGreaterThan(0);
    expect(
      findScrollView().props.stickyHeaderIndices,
      'the index form is gone',
    ).toBe(undefined);
  });
});
