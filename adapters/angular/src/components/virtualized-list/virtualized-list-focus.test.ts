// RN keeps a viewport of cells around the last focused one mounted, so a focused input survives
// the window moving away
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

const ROOT_TAG = 978;
const ITEM_HEIGHT = 100;
const VIEWPORT = 100;

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
  selector: 'symbiote-virtualized-list-focus-host',
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
      [initialNumToRender]="2"
    >
      <ng-template vListItem let-item>
        <text [testID]="'row-' + item.id">{{ 'row-' + item.id }}</text>
      </ng-template>
    </VirtualizedList>
  `,
})
class FocusHost {
  rows = rows;
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

async function scrollTo(offset: number): Promise<void> {
  fabric.fireEvent(findScrollView().instanceHandle, 'topScroll', {
    contentOffset: { x: 0, y: offset },
    contentSize: { width: 320, height: ITEM_HEIGHT * rows.length },
    layoutMeasurement: { width: 320, height: VIEWPORT },
  });
  await tick();
  await tick();
}

async function openedAt(offset: number): Promise<void> {
  mount(ROOT_TAG, FocusHost);
  await tick();
  fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
  });
  await tick();
  await scrollTo(offset);
}

describe('VirtualizedList keeps the focused cell mounted', () => {
  it('holds a viewport around it after the window moves away', async () => {
    await openedAt(800);
    const target = fabric.find(one => one.props.testID === 'row-8');
    if (target === undefined) throw new Error('row-8 is not mounted');

    fabric.fireEvent(target.instanceHandle, 'topFocus', {});
    await tick();
    await scrollTo(1_500);

    const resident = renderedRows(findScrollView().handle);
    expect(resident, 'the focused cell stays').toContain('row-8');
    expect(resident, 'a viewport either side stays').toContain('row-7');
    expect(resident, 'the rest of the old window goes').not.toContain('row-5');
  });

  it('retains nothing when no cell was ever focused', async () => {
    await openedAt(800);

    await scrollTo(1_500);

    expect(renderedRows(findScrollView().handle)).not.toContain('row-8');
  });
});
