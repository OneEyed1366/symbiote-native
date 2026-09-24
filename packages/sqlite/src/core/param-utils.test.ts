import { describe, expect, it } from 'vitest';

import {
  composeRow,
  composeRows,
  normalizeParams,
  normalizeStorageIndex,
} from './param-utils';

// Ported from expo-sqlite's paramUtils-test.ios.ts (.vendors/expo @ origin/sdk-57). Pure logic —
// no native mocking needed.
describe('normalizeParams', () => {
  it('accepts no params', () => {
    expect(normalizeParams()).toStrictEqual([{}, {}, true]);
  });

  it('accepts a variadic empty array', () => {
    expect(normalizeParams(...[])).toStrictEqual([{}, {}, true]);
  });

  it('accepts a single primitive param as an array', () => {
    expect(normalizeParams(1)).toStrictEqual([{ 0: 1 }, {}, true]);
    expect(normalizeParams('hello')).toStrictEqual([{ 0: 'hello' }, {}, true]);
  });

  it('accepts variadic params', () => {
    expect(normalizeParams(1, 2, 3)).toStrictEqual([
      { 0: 1, 1: 2, 2: 3 },
      {},
      true,
    ]);
  });

  it('accepts array params', () => {
    expect(normalizeParams([1, 2, 3])).toStrictEqual([
      { 0: 1, 1: 2, 2: 3 },
      {},
      true,
    ]);
  });

  it('accepts object params', () => {
    expect(normalizeParams({ foo: 'foo', bar: 'bar' })).toStrictEqual([
      { foo: 'foo', bar: 'bar' },
      {},
      false,
    ]);
  });

  it('converts boolean params to 0/1', () => {
    expect(normalizeParams(true)).toStrictEqual([{ 0: 1 }, {}, true]);
    expect(normalizeParams(false)).toStrictEqual([{ 0: 0 }, {}, true]);

    expect(normalizeParams('hello', true)).toStrictEqual([
      { 0: 'hello', 1: 1 },
      {},
      true,
    ]);
    expect(normalizeParams('hello', false)).toStrictEqual([
      { 0: 'hello', 1: 0 },
      {},
      true,
    ]);

    expect(normalizeParams([true, false])).toStrictEqual([
      { 0: 1, 1: 0 },
      {},
      true,
    ]);
    expect(normalizeParams({ foo: true, bar: false })).toStrictEqual([
      { foo: 1, bar: 0 },
      {},
      false,
    ]);
  });

  it('supports blob params', () => {
    const blob = new Uint8Array([0x00]);
    const blob2 = new Uint8Array([0x01]).buffer;
    expect(normalizeParams(blob)).toStrictEqual([{}, { 0: blob }, true]);
    expect(normalizeParams('hello', blob)).toStrictEqual([
      { 0: 'hello' },
      { 1: blob },
      true,
    ]);
    expect(normalizeParams(['hello', blob, 'world', blob2])).toStrictEqual([
      { 0: 'hello', 2: 'world' },
      { 1: blob, 3: blob2 },
      true,
    ]);
    expect(normalizeParams({ foo: 'foo', bar: blob })).toStrictEqual([
      { foo: 'foo' },
      { bar: blob },
      false,
    ]);
  });

  it('special case: an object followed by more params passes as an array', () => {
    expect(normalizeParams({ foo: 'foo', bar: 'bar' }, 1, 2, 3)).toStrictEqual([
      { 0: { foo: 'foo', bar: 'bar' }, 1: 1, 2: 2, 3: 3 },
      {},
      true,
    ]);
    expect(
      normalizeParams({ foo: 'foo', bar: 'bar' }, [1, 2, 3]),
    ).toStrictEqual([
      { 0: { foo: 'foo', bar: 'bar' }, 1: [1, 2, 3] },
      {},
      true,
    ]);
    expect(
      normalizeParams({ foo: 'foo', bar: 'bar' }, { hello: 'hello' }),
    ).toStrictEqual([
      { 0: { foo: 'foo', bar: 'bar' }, 1: { hello: 'hello' } },
      {},
      true,
    ]);
  });
});

describe('composeRow', () => {
  it('composes a row', () => {
    const columnNames = ['id', 'value', 'intValue'];
    const columnValues = [1, 'hello', 123];
    expect(composeRow(columnNames, columnValues)).toEqual({
      id: 1,
      value: 'hello',
      intValue: 123,
    });
  });

  it('throws when column names and values count mismatch', () => {
    const columnNames = ['id', 'value', 'intValue'];
    const columnValues = [1, 'hello'];
    expect(() => composeRow(columnNames, columnValues)).toThrow();
  });
});

describe('composeRows', () => {
  it('composes rows', () => {
    const columnNames = ['id', 'value', 'intValue'];
    const columnValuesList = [
      [1, 'hello', 123],
      [2, 'world', 456],
    ];
    expect(composeRows(columnNames, columnValuesList)).toEqual([
      { id: 1, value: 'hello', intValue: 123 },
      { id: 2, value: 'world', intValue: 456 },
    ]);
  });

  it('throws when column names and values count mismatch', () => {
    const columnNames = ['id', 'value', 'intValue'];
    const columnValuesList = [[1, 'hello']];
    expect(() => composeRows(columnNames, columnValuesList)).toThrow();
  });

  it('does not throw when the mismatch is only on some partial rows', () => {
    const columnNames = ['id', 'value', 'intValue'];
    const columnValuesList = [
      [1, 'hello', 123],
      [2, 'world'],
    ];
    expect(() => composeRows(columnNames, columnValuesList)).not.toThrow();
    expect(composeRows(columnNames, columnValuesList)).toEqual([
      { id: 1, value: 'hello', intValue: 123 },
      { id: 2, value: 'world', intValue: undefined },
    ]);
  });

  it('returns an empty array when the column values list is empty', () => {
    const columnNames = ['id', 'value', 'intValue'];
    expect(composeRows(columnNames, [])).toEqual([]);
  });
});

describe('normalizeStorageIndex', () => {
  it('returns the index for happy-path numbers', () => {
    expect(normalizeStorageIndex(0)).toBe(0);
    expect(normalizeStorageIndex(100)).toBe(100);
  });

  it('floors the index to an integer', () => {
    expect(normalizeStorageIndex(1.1)).toBe(1);
    expect(normalizeStorageIndex(1.9)).toBe(1);
    expect(normalizeStorageIndex(1.5)).toBe(1);
    expect(normalizeStorageIndex(Number.MIN_VALUE)).toBe(0);
    expect(normalizeStorageIndex(Number.EPSILON)).toBe(0);
  });

  it('supports a number given as a string', () => {
    expect(normalizeStorageIndex('1')).toBe(1);
    expect(normalizeStorageIndex('100')).toBe(100);
  });

  it('supports a boxed Number object', () => {
    expect(normalizeStorageIndex(new Number(1))).toBe(1);
    expect(normalizeStorageIndex(new Number(100))).toBe(100);
  });

  it('supports a boolean as 1 and 0', () => {
    expect(normalizeStorageIndex(true)).toBe(1);
    expect(normalizeStorageIndex(false)).toBe(0);
  });

  it('supports a `valueOf` method', () => {
    expect(normalizeStorageIndex({ valueOf: () => 1 })).toBe(1);
    expect(normalizeStorageIndex({ valueOf: () => 1.1 })).toBe(1);
    expect(normalizeStorageIndex({ valueOf: () => -1 })).toBeNull();
  });

  it('returns null for negative numbers', () => {
    expect(normalizeStorageIndex(-1)).toBeNull();
    expect(normalizeStorageIndex(-100)).toBeNull();
    expect(normalizeStorageIndex(Number.MIN_SAFE_INTEGER)).toBeNull();
  });

  it('returns 0 when the index is out of bounds', () => {
    expect(normalizeStorageIndex(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(normalizeStorageIndex(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeStorageIndex(Number.MAX_VALUE)).toBe(0);
    expect(normalizeStorageIndex(Number.NaN)).toBe(0);
  });

  it('returns 0 for non-number values', () => {
    expect(normalizeStorageIndex('a')).toBe(0);
    expect(normalizeStorageIndex({})).toBe(0);
    expect(normalizeStorageIndex(() => {})).toBe(0);
  });

  it('supports bigint with lossy conversion', () => {
    expect(normalizeStorageIndex(BigInt(1))).toBe(1);
    expect(normalizeStorageIndex(BigInt(-1))).toBeNull();
    expect(normalizeStorageIndex(BigInt(Number.MAX_VALUE))).toBe(0);
  });

  it('returns 0 for IEEE 754 negative zero', () => {
    expect(normalizeStorageIndex(-0)).toBe(0);
  });

  it('supports the maximum safe integer', () => {
    expect(normalizeStorageIndex(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
});
