// RN takes `horizontal` through VirtualizedListProps: the section list content is pinned to the row
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import type { ISection } from '@symbiote-native/components';

import '../../register';
import { mount, unmount } from '../../render';
// The barrel entry avoids the component modules' require cycle, see section-list-get-item-layout
import {
  SectionList,
  VirtualizedSectionList,
  VSectionItemDirective,
} from '../../components';

const ROOT_TAG = 957;
const ITEM_WIDTH = 40;
// One header, two items and one footer
const ENTRY_COUNT = 4;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IRow = { id: string };

const sections: ISection<IRow>[] = [
  { title: 'A', data: [{ id: 'a1' }, { id: 'a2' }] },
];

const getItemLayout = (
  _data: ReadonlyArray<ISection<IRow>> | null,
  index: number,
): { length: number; offset: number; index: number } => ({
  length: ITEM_WIDTH,
  offset: index * ITEM_WIDTH,
  index,
});

@Component({
  selector: 'symbiote-section-list-horizontal-host',
  standalone: true,
  imports: [SectionList, VSectionItemDirective],
  template: `
    <SectionList
      [sections]="sections"
      [getItemLayout]="getItemLayout"
      [horizontal]="true"
    >
      <ng-template vSectionItem let-item>
        <text>{{ item.id }}</text>
      </ng-template>
    </SectionList>
  `,
})
class SectionListHorizontalHost {
  sections = sections;
  getItemLayout = getItemLayout;
}

@Component({
  selector: 'symbiote-virtualized-section-list-horizontal-host',
  standalone: true,
  imports: [VirtualizedSectionList, VSectionItemDirective],
  template: `
    <VirtualizedSectionList
      [sections]="sections"
      [getItemLayout]="getItemLayout"
      [horizontal]="true"
    >
      <ng-template vSectionItem let-item>
        <text>{{ item.id }}</text>
      </ng-template>
    </VirtualizedSectionList>
  `,
})
class VirtualizedSectionListHorizontalHost {
  sections = sections;
  getItemLayout = getItemLayout;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

async function contentWidthOf(
  host: Parameters<typeof mount>[1],
): Promise<unknown> {
  mount(ROOT_TAG, host);
  await tick();
  const scrollView = fabric.find(node => node.viewName === 'RCTScrollView');
  if (scrollView === undefined) throw new Error('no scroll view committed');
  fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 300, height: 600 },
  });
  await tick();
  await tick();
  return live.findLive(
    live.appRoot(),
    node => node.viewName === 'RCTScrollContentView',
  )?.payload.width;
}

describe('Angular section list with horizontal', () => {
  it('pins the VirtualizedSectionList content to the full row width', async () => {
    expect(await contentWidthOf(VirtualizedSectionListHorizontalHost)).toBe(
      ENTRY_COUNT * ITEM_WIDTH,
    );
  });

  it('relays horizontal through SectionList', async () => {
    expect(await contentWidthOf(SectionListHorizontalHost)).toBe(
      ENTRY_COUNT * ITEM_WIDTH,
    );
  });
});
