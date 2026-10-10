// The default key of a list item is RN's `keyExtractor`, with a number key kept as a string

import { describe, expect, it } from 'vitest';
// @ts-expect-error - untyped Flow source
import { keyExtractor as rnKeyExtractor } from '@react-native/virtualized-lists/Lists/VirtualizeUtils';
import { defaultKeyExtractor } from './list-keys';

const ITEMS: readonly [string, unknown][] = [
  ['an own key', { key: 'a', id: 'b' }],
  ['a numeric key', { key: 7 }],
  ['a zero key', { key: 0 }],
  ['an id when the key is null', { key: null, id: 'b' }],
  ['an id when the key is missing', { id: 12 }],
  ['neither, so the index', { name: 'x' }],
  ['a string item', 'plain'],
  ['a null item', null],
  ['a number item', 5],
];

describe('defaultKeyExtractor', () => {
  it.each(ITEMS)('picks the key of RN for %s', (_name, item) => {
    expect(defaultKeyExtractor(item, 3)).toBe(String(rnKeyExtractor(item, 3)));
  });
});
