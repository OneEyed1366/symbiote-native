import { describe, expect, it } from 'vitest';
import {
  buildRows,
  clearedList,
  freshList,
  resetRowData,
  ROW_BATCH,
  SWAP_HIGH_INDEX,
  SWAP_LOW_INDEX,
  UPDATE_STRIDE,
  UPDATE_SUFFIX,
  withSwappedRows,
  withUpdatedLabels,
} from './bench-data';

const LABEL_SHAPE = /^[a-z]+ [a-z]+ [a-z]+$/;

describe('benchmark row data', () => {
  it('builds the same rows after every rewind, so each run reads one ruler', () => {
    resetRowData();
    const first = buildRows(50);
    resetRowData();

    expect(buildRows(50)).toEqual(first);
  });

  it('keeps counting ids across batches, so a keyed row is never reused', () => {
    resetRowData();
    const ids = [...buildRows(3), ...buildRows(2)].map(row => row.id);

    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it('labels every row with an adjective, a colour and a noun', () => {
    resetRowData();

    expect(buildRows(20).map(row => row.label)).toSatisfy((labels: string[]) =>
      labels.every(label => LABEL_SHAPE.test(label)),
    );
  });
});

describe('benchmark list operations', () => {
  it('starts a fresh list unselected, with a new object for every call', () => {
    resetRowData();
    const list = freshList(ROW_BATCH);

    expect(list.rows).toHaveLength(ROW_BATCH);
    expect(list.selectedId).toBeUndefined();
    expect(clearedList()).not.toBe(clearedList());
  });

  it('suffixes every tenth label and leaves the others alone', () => {
    resetRowData();
    const list = freshList(25);
    const next = withUpdatedLabels(list);

    const changed = next.rows
      .map((row, index) => (row.label === list.rows[index]?.label ? -1 : index))
      .filter(index => index >= 0);
    expect(changed).toEqual([0, UPDATE_STRIDE, UPDATE_STRIDE * 2]);
    expect(next.rows[0]?.label).toBe(list.rows[0]?.label + UPDATE_SUFFIX);
  });

  it('swaps the two sample rows and leaves the source list as it was', () => {
    resetRowData();
    const list = freshList(ROW_BATCH);
    const low = list.rows[SWAP_LOW_INDEX];
    const high = list.rows[SWAP_HIGH_INDEX];
    const next = withSwappedRows(list);

    expect(next.rows[SWAP_LOW_INDEX]).toBe(high);
    expect(next.rows[SWAP_HIGH_INDEX]).toBe(low);
    expect(list.rows[SWAP_LOW_INDEX]).toBe(low);
  });
});
