// RN's `CellRendererComponent` replaces the view around each cell and gets its key, index, item,
// style and the layout and focus handlers, with the item and its separator placed inside it
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createListHarness,
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

import '../../register';
import { mount, unmount } from '../../render';
import { FlatList } from '../flat-list';
import { VirtualizedList } from './index';
import {
  VListCellDirective,
  VListItemDirective,
  VListOutletDirective,
  VListSeparatorDirective,
} from './directives';

const ROOT_TAG = 979;
const ITEM_HEIGHT = 10;
const VIEWPORT = { width: 320, height: 100 };
const CONTENT = { width: 320, height: 3 * ITEM_HEIGHT };

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const harness = createListHarness(fabric, live);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The case's axis is read by the host when it is created, a decorator takes no parameters
let isHorizontal = false;

const SLOT_TEMPLATES = `
  <ng-template vListItem let-item><text>{{ item }}</text></ng-template>
  <ng-template vListSeparator><text>sep</text></ng-template>
  <ng-template
    vListCell
    let-item
    let-key="cellKey"
    let-index="index"
    let-style="style"
    let-layout="layout"
    let-focus="focus"
    let-content="content"
    let-body="contentContext"
  >
    <view
      [testID]="'cell-' + key + '-' + index + '-' + item"
      [style]="style"
      (layout)="layout($event)"
      (focus)="focus()"
    >
      <ng-container
        [vListOutlet]="content"
        [vListOutletContext]="body"
      ></ng-container>
    </view>
  </ng-template>
`;
const HOST_IMPORTS = [
  VirtualizedList,
  FlatList,
  VListItemDirective,
  VListSeparatorDirective,
  VListCellDirective,
  VListOutletDirective,
];

@Component({
  selector: 'symbiote-cell-renderer-flat-host',
  standalone: true,
  imports: HOST_IMPORTS,
  template: `
    <FlatList [data]="rows" [getItemLayout]="layout" [initialNumToRender]="3">
      ${SLOT_TEMPLATES}
    </FlatList>
  `,
})
class FlatCellRendererHost {
  rows = ['row-0', 'row-1', 'row-2'];
  layout = (_data: unknown, index: number) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  });
}

@Component({
  selector: 'symbiote-cell-renderer-host',
  standalone: true,
  imports: HOST_IMPORTS,
  template: `
    <VirtualizedList
      [data]="rows"
      [getItem]="getItem"
      [getItemCount]="getItemCount"
      [getItemLayout]="layout"
      [horizontal]="horizontal"
      [initialNumToRender]="3"
    >
      ${SLOT_TEMPLATES}
    </VirtualizedList>
  `,
})
class CellRendererHost {
  rows = ['row-0', 'row-1', 'row-2'];
  horizontal = isHorizontal;
  getItem = (data: readonly string[], index: number) => data[index];
  getItemCount = (data: readonly unknown[]): number => data.length;
  layout = (_data: unknown, index: number) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  });
}

async function open(
  options: { horizontal?: boolean; isFlat?: boolean } = {},
): Promise<void> {
  isHorizontal = options.horizontal === true;
  mount(
    ROOT_TAG,
    options.isFlat === true ? FlatCellRendererHost : CellRendererHost,
  );
  await tick();
  // The projected templates resolve after the first pass, the first layout re-derives the cells
  harness.simulateLayout({ viewport: VIEWPORT, content: CONTENT });
  await tick();
  await tick();
}

describe('Angular vListCell', () => {
  it('wraps every cell in the template', async () => {
    await open();

    expect(
      harness.contentView().children.map(cell => cell.payload.testID),
    ).toEqual(['cell-0-0-row-0', 'cell-1-1-row-1', 'cell-2-2-row-2']);
  });

  it('holds the item and the separator inside the wrapper', async () => {
    await open();

    expect(live.texts(live.appRoot())).toEqual([
      'row-0',
      'sep',
      'row-1',
      'sep',
      'row-2',
    ]);
  });

  it('reaches the cells of a FlatList too', async () => {
    await open({ isFlat: true });

    expect(
      harness.contentView().children.map(cell => cell.payload.testID),
    ).toEqual(['cell-0-0-row-0', 'cell-1-1-row-1', 'cell-2-2-row-2']);
  });

  it('carries the axis style RN gives the cell', async () => {
    await open({ horizontal: true });

    expect(
      harness.contentView().children.map(cell => cell.payload.flexDirection),
    ).toEqual(['row', 'row', 'row']);
  });
});
