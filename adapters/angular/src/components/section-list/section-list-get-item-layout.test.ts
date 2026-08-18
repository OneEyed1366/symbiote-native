// SectionList passes getItemLayout through FLAT (RN's shape: the SECTIONS array + a flat entry
// index); the sections-vs-entries wrapper lives one level down in VirtualizedSectionList. This
// covers the forwarding binding itself — nothing else would catch it being dropped from the
// template, since the prop is optional and its absence just turns the fast path off silently.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import type { ISection } from '@symbiote-native/components';

import { mount, unmount } from '../../render';
// Entered through the package barrel, not './index': the adapter's component modules form a
// pre-existing require cycle (components.ts <-> animated <-> scroll-view), and starting evaluation
// at section-list/index runs VirtualizedSectionList's decorators while virtualized-list is still
// mid-evaluation ("query selector wasn't defined"). The barrel is also how app code imports it.
import { SectionList, VSectionItemDirective } from '../../components';

const ROOT_TAG = 956;
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

// The host writes here (mount returns the surface, not a component ref).
const receivedData: Array<ReadonlyArray<ISection<IRow>> | null> = [];

@Component({
  selector: 'symbiote-section-list-layout-host',
  standalone: true,
  imports: [SectionList, VSectionItemDirective],
  template: `
    <SectionList [sections]="sections" [getItemLayout]="getItemLayout">
      <ng-template vSectionItem let-item>
        <symbiote-text [testID]="item.id">{{ item.id }}</symbiote-text>
      </ng-template>
    </SectionList>
  `,
})
class SectionListLayoutHost {
  sections = sections;
  getItemLayout = (
    data: ReadonlyArray<ISection<IRow>> | null,
    index: number,
  ): { length: number; offset: number; index: number } => {
    receivedData.push(data);
    return { length: ROW_HEIGHT, offset: index * ROW_HEIGHT, index };
  };
}

beforeEach(() => {
  fabric.reset();
  receivedData.length = 0;
});
afterEach(() => {
  unmount(ROOT_TAG);
});

describe('SectionList getItemLayout', () => {
  it('forwards the callback down, still called with the sections array', async () => {
    mount(ROOT_TAG, SectionListLayoutHost);
    await tick();
    await tick();

    expect(receivedData.length, 'the fixed-layout fast path ran').toBeGreaterThan(0);
    for (const data of receivedData) {
      expect(data).toBe(sections);
    }
  });
});
