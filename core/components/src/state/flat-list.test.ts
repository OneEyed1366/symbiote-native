import { describe, it, expect } from 'vitest';
import { chunkIntoRows, rowKeyExtractor } from './flat-list';

describe('rowKeyExtractor', () => {
  // why: FlatList.js's `_keyExtractor` joins each item's own key with `:` for numColumns > 1 —
  // never a synthetic `row-${index}` string, which would defeat an app's `keyExtractor` and break
  // list identity across inserts/removes.
  it('joins the app keyExtractor per item, not a synthetic row index', () => {
    const row = chunkIntoRows([{ id: 'a' }, { id: 'b' }], 2)[0];
    expect(rowKeyExtractor(row, item => item.id)).toBe('a:b');
  });

  it('falls back to each item.key/id when no keyExtractor is given', () => {
    const row = chunkIntoRows([{ key: 'x' }, { id: 'y' }], 2)[0];
    expect(rowKeyExtractor(row)).toBe('x:y');
  });

  it('falls back to the index per column when items have neither key nor id', () => {
    const row = chunkIntoRows(['a', 'b'], 2)[0];
    expect(rowKeyExtractor(row)).toBe('0:1');
  });
});

describe('chunkIntoRows', () => {
  it('packs items into rows of the given width, last row short', () => {
    expect(chunkIntoRows([1, 2, 3, 4, 5], 2)).toEqual([
      { items: [1, 2], startIndex: 0 },
      { items: [3, 4], startIndex: 2 },
      { items: [5], startIndex: 4 },
    ]);
  });
});
