// RN's FlatList takes `null` or a non-list as an empty list, the scroll view still mounts
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import '../../register';
import { mount, unmount } from '../../render';
import { FlatList } from './index';
import { VListItemDirective } from '../virtualized-list/directives';

const ROOT_TAG = 906;
const NUMBER_DATA = 123_456;
const fabric = installRecordingFabric();

// Данные кейса читает хост при создании, декоратор не принимает параметров
let currentData: unknown = null;
let currentColumns = 1;

@Component({
  selector: 'symbiote-flatlist-data-shapes-host',
  standalone: true,
  imports: [FlatList, VListItemDirective],
  template: `
    <FlatList [data]="data" [numColumns]="columns">
      <ng-template vListItem let-item>
        <text>{{ item }}</text>
      </ng-template>
    </FlatList>
  `,
})
class FlatListDataShapesHost {
  data = currentData;
  columns = currentColumns;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

async function mountWithData(data: unknown, numColumns: number): Promise<void> {
  currentData = data;
  currentColumns = numColumns;
  mount(ROOT_TAG, FlatListDataShapesHost);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

describe('Angular FlatList with data that is not a list', () => {
  it.each([
    ['null', null],
    ['a number', NUMBER_DATA],
  ])('mounts an empty scroll view for %s', async (_name, data) => {
    await mountWithData(data, 1);

    expect(
      fabric.find(node => node.viewName === 'RCTScrollView'),
    ).toBeDefined();
  });

  it('renders an array-like object by index', async () => {
    await mountWithData({ length: 2, 0: 'a', 1: 'b' }, 1);

    const texts = fabric
      .findAll(node => node.viewName === 'RCTRawText')
      .map(node => node.props.text);
    expect(texts).toEqual(['a', 'b']);
  });

  it('mounts an empty scroll view for null in a multi column list', async () => {
    await mountWithData(null, 2);

    expect(
      fabric.find(node => node.viewName === 'RCTScrollView'),
    ).toBeDefined();
  });
});
