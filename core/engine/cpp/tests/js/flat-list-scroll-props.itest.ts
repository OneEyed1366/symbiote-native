// Группа `props inherited from ScrollView` из `FlatList-itest` в RN: что Fabric разобрал у скролла

import { createElement } from 'react';

import { FlatList, mount } from '@symbiote-native/react';

import {
  describe,
  expect,
  findByTestId,
  flushTimers,
  it,
  mounted,
  report,
} from './harness';

const ROOT_TAG = 1;
const LIST_ID = 'list';

function scrollProps(props: Record<string, unknown>): Record<string, string> {
  mount(
    ROOT_TAG,
    createElement(FlatList<{ key: string }>, {
      testID: LIST_ID,
      data: null,
      ...props,
    }),
  );
  flushTimers();
  return findByTestId(LIST_ID, mounted())?.props ?? {};
}

type IScrollPropCase = {
  name: string;
  value: boolean;
  defaultValue: boolean;
};

const CASES: IScrollPropCase[] = [
  { name: 'disableIntervalMomentum', value: true, defaultValue: false },
  { name: 'horizontal', value: true, defaultValue: false },
  { name: 'scrollEnabled', value: false, defaultValue: true },
  { name: 'pagingEnabled', value: true, defaultValue: false },
  { name: 'showsVerticalScrollIndicator', value: false, defaultValue: true },
  { name: 'snapToStart', value: false, defaultValue: true },
  { name: 'snapToEnd', value: false, defaultValue: true },
];

describe('props a FlatList hands to its scroll view', () => {
  for (const { name, value, defaultValue } of CASES) {
    it(`carries ${name} ${value}`, () => {
      expect(scrollProps({ [name]: value })[name]).toBe(String(value));
    });

    // Значение по умолчанию Fabric в разобранных props не показывает
    it(`leaves ${name} out at its default ${defaultValue}`, () => {
      expect(scrollProps({ [name]: defaultValue })[name]).toBe(undefined);
    });
  }

  it('marks an inverted list for the native scrollbar', () => {
    expect(scrollProps({ inverted: true }).isInvertedVirtualizedList).toBe(
      'true',
    );
    expect(scrollProps({ inverted: false }).isInvertedVirtualizedList).toBe(
      undefined,
    );
  });
});

report();
