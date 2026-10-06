// The Angular twin of the React `section-list-rn-structure` test: separators sit inside the item
// cell, in document order, after RN's `VirtualizedSectionList.js` `ItemWithSeparator`
import '@angular/compiler';
import { Component, TemplateRef, ViewChild } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ISeparators } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import {
  VSectionFooterDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  VSectionSeparatorDirective,
  VirtualizedSectionList,
  type ISection,
} from './index';
import { VListSeparatorDirective } from '../virtualized-list';

const ROOT_TAG = 955;
const VIEWPORT = { x: 0, y: 0, width: 320, height: 2_000 };

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

type IRow = { key: string };

const section = (
  key: string,
  keys: string[],
  extra: Partial<ISection<IRow>> = {},
): ISection<IRow> => ({
  title: key,
  key,
  data: keys.map(row => ({ key: row })),
  ...extra,
});

async function stream(host: Parameters<typeof mount>[1]): Promise<string[]> {
  mount(ROOT_TAG, host);
  await tick();
  const scrollView = live.findLive(
    live.appRoot(),
    node => node.viewName === 'RCTScrollView',
  );
  const handle = scrollView?.instanceHandle;
  if (typeof handle === 'object' && handle !== null) {
    fabric.fireEvent(handle, 'topLayout', { layout: VIEWPORT });
  }
  await tick();
  await tick();
  return live.texts(live.appRoot());
}

@Component({
  selector: 'symbiote-section-structure-host',
  standalone: true,
  imports: [
    VirtualizedSectionList,
    VSectionItemDirective,
    VSectionHeaderDirective,
    VSectionFooterDirective,
    VSectionSeparatorDirective,
    VListSeparatorDirective,
  ],
  template: `
    <VirtualizedSectionList [sections]="sections">
      <ng-template vSectionItem let-item let-section="section">
        <text>{{
          section.item === undefined ? 'default:' + item.key : item.key
        }}</text>
      </ng-template>
      <ng-template vSectionHeader let-section>
        <text>header:{{ section.key }}</text>
      </ng-template>
      <ng-template vSectionFooter let-section>
        <text>footer:{{ section.key }}</text>
      </ng-template>
      <ng-template vSectionSeparator><text>section-sep</text></ng-template>
      <ng-template
        vListSeparator
        let-leadingItem="leadingItem"
        let-trailingItem="trailingItem"
      >
        <text>sep:{{ leadingItem.key }}>{{ trailingItem.key }}</text>
      </ng-template>
    </VirtualizedSectionList>
  `,
})
class StructureHost {
  sections = [section('s1', ['i1', 'i2']), section('s2', ['i3'])];
}

describe('Angular VirtualizedSectionList renders separators like RN', () => {
  it('paints section separators around the items and item separators between them', async () => {
    const texts = await stream(StructureHost);

    expect(texts).toEqual([
      'header:s1',
      'section-sep',
      'default:i1',
      'sep:i1>i2',
      'default:i2',
      'section-sep',
      'footer:s1',
      'header:s2',
      'section-sep',
      'default:i3',
      'section-sep',
      'footer:s2',
    ]);
  });
});

@Component({
  selector: 'symbiote-section-override-host',
  standalone: true,
  imports: [
    VirtualizedSectionList,
    VSectionItemDirective,
    VListSeparatorDirective,
  ],
  template: `
    <ng-template #custom let-item
      ><text>custom:{{ item.key }}</text></ng-template
    >
    <ng-template #customSep><text>custom-sep</text></ng-template>
    <VirtualizedSectionList [sections]="sections">
      <ng-template vSectionItem let-item
        ><text>default:{{ item.key }}</text></ng-template
      >
      <ng-template vListSeparator><text>default-sep</text></ng-template>
    </VirtualizedSectionList>
  `,
})
class OverrideHost {
  @ViewChild('custom', { static: true }) custom!: TemplateRef<never>;
  @ViewChild('customSep', { static: true }) customSep!: TemplateRef<never>;
  sections: ISection<IRow>[] = [];

  ngOnInit(): void {
    this.sections = [
      section('s1', ['i1', 'i2'], {
        item: this.custom,
        separator: this.customSep,
      }),
      section('s2', ['i3', 'i4']),
    ];
  }
}

describe('Angular VirtualizedSectionList section overrides', () => {
  it('lets a section bring its own item and separator templates', async () => {
    const texts = await stream(OverrideHost);

    expect(texts).toEqual([
      'custom:i1',
      'custom-sep',
      'custom:i2',
      'default:i3',
      'default-sep',
      'default:i4',
    ]);
  });
});

@Component({
  selector: 'symbiote-section-highlight-host',
  standalone: true,
  imports: [
    VirtualizedSectionList,
    VSectionItemDirective,
    VListSeparatorDirective,
  ],
  template: `
    <VirtualizedSectionList [sections]="sections">
      <ng-template vSectionItem let-item let-separators="separators">
        <text>{{ remember(item.key, separators) }}</text>
      </ng-template>
      <ng-template vListSeparator let-highlighted
        ><text>sep:{{ highlighted }}</text></ng-template
      >
    </VirtualizedSectionList>
  `,
})
class HighlightHost {
  sections = [section('s1', ['i1', 'i2', 'i3'])];
  static handles: Record<string, ISeparators> = {};

  remember(key: string, separators: ISeparators): string {
    HighlightHost.handles[key] = separators;
    return key;
  }
}

describe('Angular VirtualizedSectionList separator state across cells', () => {
  it('lights the separators around a cell on highlight', async () => {
    const texts = await stream(HighlightHost);
    expect(texts).toEqual(['i1', 'sep:false', 'i2', 'sep:false', 'i3']);

    HighlightHost.handles['i2'].highlight();
    await tick();
    await tick();

    expect(live.texts(live.appRoot())).toEqual([
      'i1',
      'sep:true',
      'i2',
      'sep:true',
      'i3',
    ]);
  });
});
