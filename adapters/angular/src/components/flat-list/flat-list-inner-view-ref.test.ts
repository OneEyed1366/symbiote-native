// RN hands a list's `innerViewRef` to its ScrollView through `...props`
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import '../../register';
import { mount, unmount } from '../../render';
import { FlatList } from './index';
import { VListItemDirective } from '../virtualized-list/directives';

const ROOT_TAG = 905;
const fabric = installRecordingFabric();
const innerViewRef = vi.fn();

@Component({
  selector: 'symbiote-flatlist-inner-view-ref-host',
  standalone: true,
  imports: [FlatList, VListItemDirective],
  template: `
    <FlatList [data]="rows" [innerViewRef]="innerViewRef">
      <ng-template vListItem let-item>
        <text>{{ item }}</text>
      </ng-template>
    </FlatList>
  `,
})
class FlatListInnerViewRefHost {
  rows = ['a', 'b'];
  innerViewRef = innerViewRef;
}

beforeEach(() => {
  fabric.reset();
  innerViewRef.mockClear();
});
afterEach(() => unmount(ROOT_TAG));

describe('Angular FlatList innerViewRef', () => {
  it('receives the content node and null after unmount', async () => {
    mount(ROOT_TAG, FlatListInnerViewRefHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(innerViewRef).toHaveBeenCalledTimes(1);
    expect(innerViewRef).not.toHaveBeenCalledWith(null);

    unmount(ROOT_TAG);

    expect(innerViewRef).toHaveBeenLastCalledWith(null);
  });
});
