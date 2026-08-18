// getItemLayout is FLAT (RN's own shape): the app's callback takes the SECTIONS array, but the
// inner VirtualizedList streams the FLATTENED entries as its `data` — so VirtualizedSectionList
// wraps it (index.ts's entryItemLayout getter). Without the wrapper the callback would silently
// receive the entries here and the sections on RN, with nothing at the call site to reveal why.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import type { ISection } from '@symbiote-native/components';

import { mount, unmount } from '../../render';
import { VirtualizedSectionList, VSectionItemDirective } from './index';

const ROOT_TAG = 955;
const ROW_HEIGHT = 40;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

interface IRow {
  id: string;
}

const sections: ISection<IRow>[] = [
  { title: 'A', data: [{ id: 'a1' }, { id: 'a2' }] },
  { title: 'B', data: [{ id: 'b1' }] },
];

@Component({
  selector: 'symbiote-virtualized-section-list-layout-host',
  standalone: true,
  imports: [VirtualizedSectionList, VSectionItemDirective],
  template: `
    <VirtualizedSectionList [sections]="sections" [getItemLayout]="getItemLayout">
      <ng-template vSectionItem let-item>
        <symbiote-text [testID]="item.id">{{ item.id }}</symbiote-text>
      </ng-template>
    </VirtualizedSectionList>
  `,
})
class VirtualizedSectionListLayoutHost {
  sections = sections;
  getItemLayout = (
    data: ReadonlyArray<ISection<IRow>> | null,
    index: number,
  ): { length: number; offset: number; index: number } => {
    receivedData.push(data);
    return { length: ROW_HEIGHT, offset: index * ROW_HEIGHT, index };
  };
}

// The host writes here (mount returns the surface, not a component ref).
const receivedData: Array<ReadonlyArray<ISection<IRow>> | null> = [];

beforeEach(() => {
  fabric.reset();
  receivedData.length = 0;
});
afterEach(() => {
  unmount(ROOT_TAG);
});

describe('VirtualizedSectionList getItemLayout', () => {
  it('calls the callback with the sections array, not the flattened entries', async () => {
    mount(ROOT_TAG, VirtualizedSectionListLayoutHost);
    await tick();
    await tick();

    expect(receivedData.length, 'the fixed-layout fast path ran').toBeGreaterThan(0);
    for (const data of receivedData) {
      expect(data).toBe(sections);
    }
  });
});
