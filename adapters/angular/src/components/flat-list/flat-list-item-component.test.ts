// `listItemComponent` это RN `ListItemComponent`: компонент рисует ячейку по item и index
import '@angular/compiler';
import { Component, Input } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISeparators } from '@symbiote-native/components';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import '../../register';
import { mount, unmount } from '../../render';
import { FlatList } from './index';
import { VListItemDirective } from '../virtualized-list/directives';

const ROOT_TAG = 907;
const BOTH_PRESENT =
  'VirtualizedList: Both ListItemComponent and renderItem props are present. ListItemComponent will take precedence over renderItem.';

type IRow = { key: string };

const DATA: IRow[] = [{ key: 'i1' }, { key: 'i2' }, { key: 'i3' }];
const seenSeparators: ISeparators[] = [];

@Component({
  selector: 'symbiote-list-item',
  standalone: true,
  template: `<text>{{ index + ':' + item.key }}</text>`,
})
class ListItem {
  @Input() item!: IRow;
  @Input() index!: number;
  @Input() separators!: ISeparators;

  ngOnInit(): void {
    seenSeparators.push(this.separators);
  }
}

let currentColumns = 1;

@Component({
  selector: 'symbiote-list-item-host',
  standalone: true,
  imports: [FlatList],
  template: `<FlatList
    [data]="data"
    [numColumns]="columns"
    [listItemComponent]="itemComponent"
  />`,
})
class ListItemHost {
  data = DATA;
  columns = currentColumns;
  itemComponent = ListItem;
}

@Component({
  selector: 'symbiote-list-item-both-host',
  standalone: true,
  imports: [FlatList, VListItemDirective],
  template: `<FlatList [data]="data" [listItemComponent]="itemComponent">
    <ng-template vListItem let-item><text>from template</text></ng-template>
  </FlatList>`,
})
class ListItemBothHost {
  data = DATA;
  itemComponent = ListItem;
}

const fabric = installRecordingFabric();
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
const tick = (): Promise<void> =>
  new Promise<void>(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  warn.mockClear();
  seenSeparators.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

async function textsOf(
  host: typeof ListItemHost | typeof ListItemBothHost,
  numColumns = 1,
): Promise<unknown[]> {
  currentColumns = numColumns;
  mount(ROOT_TAG, host);
  await tick();
  await tick();
  return fabric
    .findAll(node => node.viewName === 'RCTRawText')
    .map(node => node.props.text);
}

describe('Angular listItemComponent', () => {
  it('draws every item and hands it item and index', async () => {
    expect(await textsOf(ListItemHost)).toEqual(['0:i1', '1:i2', '2:i3']);
  });

  it('draws every item of a multi column list with its own index', async () => {
    expect(await textsOf(ListItemHost, 2)).toEqual(['0:i1', '1:i2', '2:i3']);
  });

  it('hands the component a separators handle', async () => {
    await textsOf(ListItemHost);

    expect(seenSeparators.length).toBeGreaterThan(0);
    expect(typeof seenSeparators[0].highlight).toBe('function');
  });

  it('lets the component win over the vListItem template and warns', async () => {
    expect(await textsOf(ListItemBothHost)).toEqual(['0:i1', '1:i2', '2:i3']);
    expect(warn).toHaveBeenCalledWith(BOTH_PRESENT);
  });
});
