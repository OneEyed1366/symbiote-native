// FlatList's removeClippedSubviews, against RN's FlatList.js: the list ALWAYS sends it to its
// ScrollView, defaulting to `Platform.OS === 'android'` when the app sets none.

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Platform } from '@symbiote-native/engine';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { FlatList } from './index';
import { VListItemDirective } from '../virtualized-list/directives';

const ROOT_TAG = 908;
const fabric = installRecordingFabric();

@Component({
  selector: 'symbiote-default-clip-host',
  standalone: true,
  imports: [FlatList, VListItemDirective],
  template: `
    <FlatList [data]="rows">
      <ng-template vListItem let-item
        ><text>{{ item }}</text></ng-template
      >
    </FlatList>
  `,
})
class DefaultClipHost {
  rows = ['a', 'b'];
}

@Component({
  selector: 'symbiote-authored-clip-host',
  standalone: true,
  imports: [FlatList, VListItemDirective],
  template: `
    <FlatList
      [data]="rows"
      [removeClippedSubviews]="true"
      [nestedScrollEnabled]="true"
    >
      <ng-template vListItem let-item
        ><text>{{ item }}</text></ng-template
      >
    </FlatList>
  `,
})
class AuthoredClipHost {
  rows = ['a', 'b'];
}

const appTransform = [{ rotate: '0deg' }];

@Component({
  selector: 'symbiote-inverted-host',
  standalone: true,
  imports: [FlatList, VListItemDirective],
  template: `
    <FlatList [data]="rows" [inverted]="true" [style]="style">
      <ng-template vListItem let-item
        ><text>{{ item }}</text></ng-template
      >
    </FlatList>
  `,
})
class InvertedHost {
  rows = ['a', 'b'];
  style = { transform: appTransform };
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const settle = async (): Promise<void> => {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  await new Promise<void>(resolve => setTimeout(resolve, 0));
};

function scrollPayload(): Record<string, unknown> {
  const node = fabric
    .findAll(candidate => candidate.viewName === 'RCTScrollView')
    .at(-1);
  if (node === undefined) throw new Error('no RCTScrollView created');
  return payloadOf(node.handle);
}

describe('Angular FlatList removeClippedSubviews (Positive — no throwing path)', () => {
  // why: RN sends `removeClippedSubviews ?? Platform.OS === 'android'` — false on iOS, explicitly.
  it('sends false on iOS when the app sets none', async () => {
    mount(ROOT_TAG, DefaultClipHost);
    await settle();
    expect(scrollPayload().removeClippedSubviews).toBe(false);
  });

  // why: Android clips off-screen rows by default in RN.
  it('sends true on Android when the app sets none', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    try {
      mount(ROOT_TAG, DefaultClipHost);
      await settle();
      expect(scrollPayload().removeClippedSubviews).toBe(true);
    } finally {
      Object.defineProperty(Platform, 'OS', {
        value: original,
        configurable: true,
      });
    }
  });

  // why: an authored value always reaches the ScrollView.
  it('forwards an authored value', async () => {
    mount(ROOT_TAG, AuthoredClipHost);
    await settle();
    expect(scrollPayload().removeClippedSubviews).toBe(true);
  });

  // why: RN's VirtualizedList spreads its props onto the ScrollView; a list nested in a vertical
  // scroller on Android scrolls only with nestedScrollEnabled.
  it('forwards nestedScrollEnabled to the scroll view', async () => {
    mount(ROOT_TAG, AuthoredClipHost);
    await settle();
    expect(scrollPayload().nestedScrollEnabled).toBe(true);
  });
});

describe('Angular VirtualizedList inversion (Positive — no throwing path)', () => {
  // why: VirtualizedList.js:1111 sends `isInvertedVirtualizedList: inverted` for Android's scrollbar.
  it('tells the scroll view whether the list is inverted', async () => {
    mount(ROOT_TAG, InvertedHost);
    await settle();
    expect(scrollPayload().isInvertedVirtualizedList).toBe(true);
  });

  // why: RN composes `[inversionStyle, style]`, so the app's own transform wins over the flip.
  it('lets the app style override the inversion flip', async () => {
    mount(ROOT_TAG, InvertedHost);
    await settle();
    expect(scrollPayload().transform).toEqual(appTransform);
  });
});
