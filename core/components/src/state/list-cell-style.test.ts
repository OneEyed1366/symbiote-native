// RN's cell wrapper style (`VirtualizedListCellRenderer`): a horizontal list lays its cell out as
// a row so the separator sits beside the item, an inverted one reverses the order it flips back
import { describe, expect, it } from 'vitest';
import { INVERTED_X_STYLE, INVERTED_Y_STYLE } from './list-constants';
import { cellStyleOf } from './list-view';

describe('cellStyleOf', () => {
  it('leaves a vertical list cell unstyled', () => {
    expect(cellStyleOf({ horizontal: false, inverted: false })).toBeUndefined();
  });

  it('lays a horizontal cell out as a row', () => {
    expect(cellStyleOf({ horizontal: true, inverted: false })).toEqual({
      flexDirection: 'row',
    });
  });

  it('reverses a vertical inverted cell and flips it back', () => {
    expect(cellStyleOf({ horizontal: false, inverted: true })).toEqual([
      { flexDirection: 'column-reverse' },
      INVERTED_Y_STYLE,
    ]);
  });

  it('reverses a horizontal inverted cell and flips it back', () => {
    expect(cellStyleOf({ horizontal: true, inverted: true })).toEqual([
      { flexDirection: 'row-reverse' },
      INVERTED_X_STYLE,
    ]);
  });
});
