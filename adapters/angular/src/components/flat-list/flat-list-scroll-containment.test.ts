import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { childrenOf } from '@symbiote-native/engine';
import {
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { FlatList } from './index';
import { VListItemDirective } from '../virtualized-list/directives';

const ROOT_TAG = 907;
const fabric = installRecordingFabric();

interface IChip {
  id: string;
  n: number;
}

const chips: IChip[] = Array.from({ length: 24 }, (_unused, index) => ({
  id: `c-${index}`,
  n: index,
}));

// Mirrors examples/angular/App.ts's "FlatList · 24 chips" demo end to end: a horizontal FlatList
// with getItemLayout. Regression coverage for a bug fixed 2026-07: cell content used to land
// OUTSIDE the ScrollView's content view entirely — as top-level siblings
// of the committed RCTScrollView node, instead of children of its RCTScrollContentView — which is
// why the device screenshot showed full-width vertically-stacked chips instead of a small
// horizontal row. Root cause was `<ng-content>` declared once per `@if`/`@else` branch in
// scroll-view/index.ios.ts (a documented Angular limitation, angular/angular#53310); fixed by
// collapsing to a single unconditional host tag since iOS never needed axis-specific tags to begin
// with (`horizontal` already flows as a plain prop). This test pins the CORRECT tree shape.
@Component({
  selector: 'symbiote-chip-container-host',
  standalone: true,
  imports: [FlatList, VListItemDirective],
  template: `
    <FlatList
      testID="chips-list"
      [data]="chips"
      [horizontal]="true"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
      [style]="chipListStyle"
    >
      <ng-template vListItem let-item>
        <view [testID]="'chip-' + item.n" [style]="chipCardStyle">
          <text>{{ item.n }}</text>
        </view>
      </ng-template>
    </FlatList>
  `,
})
class ChipContainerHost {
  chips = chips;
  chipListStyle = { height: 84 };
  chipCardStyle = { width: 72, height: 64, borderRadius: 14 };
  keyExtractor = (item: IChip): string => item.id;
  getItemLayout = (
    _data: unknown,
    index: number,
  ): { length: number; offset: number; index: number } => ({
    length: 64,
    offset: 64 * index,
    index,
  });
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The AUTHORED tree, walked from a known handle via the engine's own child links — not a search
// over `fabric.committed` (the recording host has no committed tree; see its header).
function findUnder(
  handle: object,
  predicate: (node: IAuthoredNode) => boolean,
): IAuthoredNode | undefined {
  for (const child of childrenOf(handle)) {
    const recorded = fabric.find(node => node.handle === child);
    if (recorded !== undefined && predicate(recorded)) return recorded;
    const below = findUnder(child, predicate);
    if (below !== undefined) return below;
  }
  return undefined;
}

describe('FlatList cells stay inside the ScrollView content view', () => {
  it('nests chip cells under RCTScrollContentView, not as siblings of RCTScrollView', async () => {
    mount(ROOT_TAG, ChipContainerHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const scroll = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(scroll).toBeDefined();
    if (scroll === undefined) return;

    const chip0InsideScroll = findUnder(
      scroll.handle,
      node => node.props.testID === 'chip-0',
    );
    expect(chip0InsideScroll).toBeDefined();
  });
});
