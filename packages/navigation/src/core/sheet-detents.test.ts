// Form sheet detent options folded into the native numbers, with the vendor's checks in development

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveSheetAllowedDetents,
  resolveSheetInitialDetent,
  resolveSheetLargestUndimmedDetent,
} from './sheet-detents';

beforeEach(() => {
  Reflect.set(globalThis, '__DEV__', true);
});

afterEach(() => {
  Reflect.set(globalThis, '__DEV__', false);
  vi.restoreAllMocks();
});

describe('allowed detents', () => {
  it.each([
    ['fitToContents', [-1]],
    ['large', [1]],
    ['medium', [0.5]],
    ['all', [0.5, 1]],
    [undefined, [1]],
  ] as const)('turns the %s preset into %j', (preset, detents) => {
    expect(resolveSheetAllowedDetents(preset, false)).toEqual(detents);
  });

  it('passes a sorted array through', () => {
    expect(resolveSheetAllowedDetents([0.3, 0.6, 1], false)).toEqual([
      0.3, 0.6, 1,
    ]);
  });

  it('refuses an unsorted array in development', () => {
    expect(() => resolveSheetAllowedDetents([1, 0.5], false)).toThrow(
      '[RNScreens] The detent array is not sorted in ascending order!',
    );
  });

  it('accepts an unsorted array in a release build', () => {
    Reflect.set(globalThis, '__DEV__', false);

    expect(resolveSheetAllowedDetents([1, 0.5], false)).toEqual([1, 0.5]);
  });

  it('keeps the first three detents on Android and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(resolveSheetAllowedDetents([0.2, 0.4, 0.6, 0.8], true)).toEqual([
      0.2, 0.4, 0.6,
    ]);
    expect(warn).toHaveBeenCalledWith(
      '[RNScreens] Sheets API on Android do accept only up to 3 values. Any surplus value are ignored.',
    );
  });

  it('keeps every detent on iOS', () => {
    expect(resolveSheetAllowedDetents([0.2, 0.4, 0.6, 0.8], false)).toEqual([
      0.2, 0.4, 0.6, 0.8,
    ]);
  });
});

describe('largest undimmed detent', () => {
  it.each([
    ['last', 2],
    ['large', 1],
    ['medium', 0],
    ['none', -1],
    ['all', -1],
    [undefined, -1],
    [1, 1],
  ] as const)('turns %s into index %i', (value, index) => {
    expect(resolveSheetLargestUndimmedDetent(value, 2)).toBe(index);
  });

  it('refuses an index past the last detent in development', () => {
    expect(() => resolveSheetLargestUndimmedDetent(3, 2)).toThrow(
      "[RNScreens] Provided value of 'sheetLargestUndimmedDetentIndex' prop is out of bounds of 'sheetAllowedDetents' array.",
    );
  });

  it('falls back to always dimmed in a release build', () => {
    Reflect.set(globalThis, '__DEV__', false);

    expect(resolveSheetLargestUndimmedDetent(3, 2)).toBe(-1);
  });

  it('refuses a fractional index in development', () => {
    expect(() => resolveSheetLargestUndimmedDetent(0.5, 2)).toThrow(
      'out of bounds',
    );
  });
});

describe('initial detent', () => {
  it.each([
    ['last', 2],
    [undefined, 0],
    [1, 1],
  ] as const)('turns %s into index %i', (value, index) => {
    expect(resolveSheetInitialDetent(value, 2)).toBe(index);
  });

  it('refuses an index past the last detent in development', () => {
    expect(() => resolveSheetInitialDetent(3, 2)).toThrow(
      "[RNScreens] Provided value of 'sheetInitialDetentIndex' prop is out of bounds of 'sheetAllowedDetents' array.",
    );
  });

  it('refuses a negative index in development', () => {
    expect(() => resolveSheetInitialDetent(-1, 2)).toThrow('out of bounds');
  });

  it('starts at the first detent in a release build when the index is out of bounds', () => {
    Reflect.set(globalThis, '__DEV__', false);

    expect(resolveSheetInitialDetent(3, 2)).toBe(0);
  });
});
