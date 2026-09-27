import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

import { readAngularProfile } from '../../diagnostics';
import { mount, unmount } from '../../render';
import { FlatList } from './index';
import {
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
} from '../virtualized-list/directives';

const ROOT_TAG = 904;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

interface IRow {
  id: string;
  n: number;
}

const rows: IRow[] = Array.from({ length: 5 }, (_unused, index) => ({
  id: `r-${index}`,
  n: index,
}));

// Regression coverage for a real bug: FlatList's single-column path used to forward the app's
// <ng-template vListItem> to the inner VirtualizedList via a bare <ng-content></ng-content>
// passthrough. Angular's @ContentChild does NOT resolve a directive across that second projection
// hop (it only sees what was projected directly onto the querying component's own tag), so
// VirtualizedList's itemDir stayed undefined and every cell rendered empty — a real device symptom
// (a blank list) that headless testing never caught because no test existed for this component
// family. Fixed by having FlatList capture its own @ContentChild (a single, direct hop) and
// re-stamp explicit <ng-template>s onto <VirtualizedList>, mirroring VirtualizedSectionList's own
// (already-working) re-stamp pattern. SectionList had the identical bug, fixed the same way.
@Component({
  selector: 'symbiote-flatlist-host',
  standalone: true,
  imports: [
    FlatList,
    VListItemDirective,
    VListHeaderDirective,
    VListFooterDirective,
    VListEmptyDirective,
  ],
  template: `
    <FlatList
      testID="rows-list"
      [data]="rows"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
      [style]="{ height: 120 }"
    >
      <ng-template vListHeader>
        <text testID="header">header</text>
      </ng-template>
      <ng-template vListItem let-item>
        <text [testID]="'row-' + item.n">{{ 'row ' + item.n }}</text>
      </ng-template>
      <ng-template vListFooter>
        <text testID="footer">footer</text>
      </ng-template>
    </FlatList>
  `,
})
class FlatListHost {
  rows = rows;
  keyExtractor = (item: IRow): string => item.id;
  getItemLayout = (
    _data: unknown,
    index: number,
  ): { length: number; offset: number; index: number } => ({
    length: 30,
    offset: 30 * index,
    index,
  });
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('FlatList', () => {
  it('stamps the header, every row, and the footer through the projected templates', async () => {
    mount(ROOT_TAG, FlatListHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // The LIVE tree, not the creation log: a cell the list stamped and then recycled away would
    // still answer the log, and "the footer is stamped" would pass after it stopped being there.
    const texts = live
      .findAllLive(live.appRoot(), node => node.payload.testID !== undefined)
      .map(node => node.payload.testID);

    expect(texts).toContain('header');
    expect(texts).toContain('footer');
    for (let index = 0; index < rows.length; index += 1) {
      expect(texts).toContain(`row-${index}`);
    }
  });
});

@Component({
  selector: 'symbiote-flatlist-cells-host',
  standalone: true,
  imports: [FlatList, VListItemDirective],
  template: `
    <FlatList
      [data]="rows"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
      [style]="{ height: 150 }"
    >
      <ng-template vListItem let-item>
        <text>{{ item.n }}</text>
      </ng-template>
    </FlatList>
  `,
})
class FlatListCellsHost {
  rows = rows;
  keyExtractor = (item: IRow): string => item.id;
  getItemLayout = (
    _data: unknown,
    index: number,
  ): { length: number; offset: number; index: number } => ({
    length: 30,
    offset: 30 * index,
    index,
  });
}

describe('a single-column FlatList', () => {
  // why: every cell outlet is an embedded view + a directive instance + a view container, and a
  // list pays it per visible row on every replace. A single column has no row packing to do, so
  // the app's item template must reach VirtualizedList's cell directly - one outlet per cell, not
  // a FlatList wrapper outlet around the app's own.
  it('stamps each cell through exactly one outlet', async () => {
    readAngularProfile();
    mount(ROOT_TAG, FlatListCellsHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(readAngularProfile().outletCreates).toBe(rows.length);
  });
});

@Component({
  selector: 'symbiote-flatlist-separator-host',
  standalone: true,
  imports: [FlatList, VListItemDirective, VListSeparatorDirective],
  template: `
    <FlatList
      [data]="rows"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
      [style]="{ height: 150 }"
    >
      <ng-template vListItem let-item>
        <text>{{ item.n }}</text>
      </ng-template>
      <ng-template vListSeparator let-leadingItem="leadingItem">
        <text [testID]="'sep-' + leadingItem?.n">-</text>
      </ng-template>
    </FlatList>
  `,
})
class FlatListSeparatorHost {
  rows = rows;
  keyExtractor = (item: IRow): string => item.id;
  getItemLayout = (
    _data: unknown,
    index: number,
  ): { length: number; offset: number; index: number } => ({
    length: 30,
    offset: 30 * index,
    index,
  });
}

describe('a single-column FlatList separator', () => {
  // why: RN's ItemSeparatorComponent sits between two items and receives the item above it as
  // leadingItem; none follows the last item of the data.
  it('renders between items, carrying the item above it', async () => {
    mount(ROOT_TAG, FlatListSeparatorHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const separators = live
      .findAllLive(live.appRoot(), node =>
        String(node.payload.testID).startsWith('sep-'),
      )
      .map(node => node.payload.testID);

    expect(separators).toEqual(rows.slice(0, -1).map(row => `sep-${row.n}`));
  });
});
