// Angular's ScrollView applies stickyHeaderIndices POSITIONALLY: the projection controller
// (projection.ts) keeps its own ordered `records` array of the children projected into the scroll
// content, counts non-anchor records to derive each child's paint index, and wraps the ones whose
// index appears in stickyHeaderIndices. That only holds while `records` mirrors the content node's
// real children — and a windowed list removes cells continuously as it scrolls.
//
// Regression for the drift that produced it: removals of a NON-wrapped projected child bypassed the
// controller entirely (removeScrollViewProjectedChild only knew about children it had wrapped), so
// every recycled cell left a dead record behind. The paint index of every later child then grew by
// one per removed cell — the sticky wrapper landed on an earlier child the further the list was
// scrolled, and wrapRecord re-appended that already-detached node to the content, painting a stale
// section header on top of live rows.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { VirtualizedList } from '../virtualized-list';
import { VListItemDirective } from '../virtualized-list/directives';

const ROOT_TAG = 981;
const ITEM_HEIGHT = 50;
const VIEWPORT = 100;
const ITEM_COUNT = 120;
// Every 6th row is a section header, the flattened shape a SectionList hands VirtualizedList.
const SECTION_STRIDE = 6;

interface IRow {
  id: number;
}

const rows: IRow[] = Array.from({ length: ITEM_COUNT }, (_unused, index) => ({ id: index }));
const stickyIndices = rows.filter(row => row.id % SECTION_STRIDE === 0).map(row => row.id);

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'symbiote-projection-removal-tracking-host',
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
        <symbiote-text [testID]="'row-' + item.id">{{ 'row-' + item.id }}</symbiote-text>
      </ng-template>
    </VirtualizedList>
  `,
})
class ProjectionRemovalHost {
  rows = rows;
  stickyHeaderIndices = stickyIndices;
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

function findScrollView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  expect(node, 'scroll view node found in committed tree').toBeDefined();
  if (node === undefined) throw new Error('unreachable: scroll view missing');
  return node;
}

function renderedRowIds(nodes: readonly IFakeNode[]): number[] {
  const found: number[] = [];
  for (const node of nodes) {
    const testID = node.props.testID;
    if (typeof testID === 'string' && testID.startsWith('row-')) {
      found.push(Number(testID.slice('row-'.length)));
    }
    found.push(...renderedRowIds(node.children));
  }
  return found;
}

async function scrollTo(offset: number): Promise<void> {
  fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
  });
  fabric.fireEvent(findScrollView().instanceHandle, 'topScroll', {
    contentOffset: { x: 0, y: offset },
    contentSize: { width: 320, height: ITEM_HEIGHT * ITEM_COUNT },
    layoutMeasurement: { width: 320, height: VIEWPORT },
  });
  await tick();
  await tick();
}

// No Negative group: there is no invalid caller input to reject here — the behaviour under test is
// an ordering invariant between the controller's record list and the committed child list, which
// only a real scroll sequence can exercise.
describe('ScrollView projection tracks removals of non-wrapped projected children', () => {
  it('keeps sticky wrapping on the current section header after a long scroll', async () => {
    mount(ROOT_TAG, ProjectionRemovalHost);
    await tick();
    await tick();
    fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });
    await tick();

    // Walk the list in small steps, the way a drag does: each step recycles the cells that left
    // the window, which is what feeds the controller's record list.
    for (let offset = 0; offset <= 3100; offset += 100) {
      await scrollTo(offset);
      if (offset % 500 === 0)
        console.log('AT', offset, JSON.stringify(renderedRowIds(fabric.committed)));
    }

    const rendered = renderedRowIds(fabric.committed).sort((a, b) => a - b);
    const windowStart = Math.floor(3100 / ITEM_HEIGHT);
    // The only cell allowed to live outside the window is the forced sticky header just below it.
    const forcedSticky = Math.floor(windowStart / SECTION_STRIDE) * SECTION_STRIDE;
    console.log('RENDERED', JSON.stringify(rendered), 'forced', forcedSticky);
    const stragglers = rendered.filter(id => id < forcedSticky);
    expect(stragglers, 'no already-recycled cell is resurrected into the content').toEqual([]);
    expect(rendered.includes(forcedSticky), 'the current section header stays mounted').toBe(true);
  });
});
