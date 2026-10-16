/** @jsxRuntime automatic */
// RN отдаёт `innerViewRef` списка его ScrollView через `...props`
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FlatList,
  SectionList,
  VirtualizedList,
  mount,
  unmount,
} from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 6_202;

const fabric = installRecordingFabric();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('list innerViewRef', () => {
  it('reaches the content node of a FlatList and is released on unmount', () => {
    const innerViewRef = vi.fn();
    mount(
      ROOT_TAG,
      createElement(FlatList<string>, {
        data: ['a', 'b'],
        renderItem: ({ item }) => createElement('text', {}, item),
        innerViewRef,
      }),
    );

    expect(innerViewRef).toHaveBeenCalledTimes(1);
    expect(innerViewRef).not.toHaveBeenCalledWith(null);

    unmount(ROOT_TAG);

    expect(innerViewRef).toHaveBeenLastCalledWith(null);
  });

  it('reaches the content node of a SectionList', () => {
    const innerViewRef = vi.fn();
    mount(
      ROOT_TAG,
      createElement(SectionList<string>, {
        sections: [{ title: 's', data: ['a'] }],
        renderItem: ({ item }) => createElement('text', {}, item),
        innerViewRef,
      }),
    );

    expect(innerViewRef).toHaveBeenCalledTimes(1);
    expect(innerViewRef).not.toHaveBeenCalledWith(null);
  });

  it('reaches the content node of a VirtualizedList', () => {
    const innerViewRef = vi.fn();
    mount(
      ROOT_TAG,
      createElement(VirtualizedList<string>, {
        data: null,
        getItem: () => 'a',
        getItemCount: () => 1,
        keyExtractor: item => item,
        renderItem: ({ item }) => createElement('text', {}, item),
        innerViewRef,
      }),
    );

    expect(innerViewRef).toHaveBeenCalledTimes(1);
    expect(innerViewRef).not.toHaveBeenCalledWith(null);
  });
});
