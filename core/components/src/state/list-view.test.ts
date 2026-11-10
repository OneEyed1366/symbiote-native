import { describe, expect, it } from 'vitest';

import { contentContainerStyleOf } from './list-view';

const APP_STYLE = { padding: 4 };
const ROW_TOTAL = 240;

describe('contentContainerStyleOf', () => {
  it('leaves a vertical list alone', () => {
    expect(contentContainerStyleOf(false, APP_STYLE, ROW_TOTAL)).toBe(
      APP_STYLE,
    );
  });

  it('pins a horizontal list to the width its cells measured', () => {
    expect(contentContainerStyleOf(true, APP_STYLE, ROW_TOTAL)).toEqual([
      APP_STYLE,
      { width: ROW_TOTAL },
    ]);
  });

  // RN pins nothing: a width of 0 before the first measurement folds every cell onto the origin
  it('does not pin a horizontal list that has measured nothing yet', () => {
    expect(contentContainerStyleOf(true, APP_STYLE, 0)).toBe(APP_STYLE);
  });
});
