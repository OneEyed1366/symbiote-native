import { describe, expect, it } from 'vitest';
import {
  isTypedArray,
  normalizedContentType,
  preprocessOptions,
} from './utils';

describe('normalizedContentType', () => {
  it('lowercases a valid ascii-printable type', () => {
    expect(normalizedContentType('TEXT/Plain')).toBe('text/plain');
  });

  it('returns an empty string for undefined', () => {
    expect(normalizedContentType(undefined)).toBe('');
  });

  it('returns an empty string for a non-ascii-printable type', () => {
    expect(normalizedContentType('text/plain\n')).toBe('');
  });
});

describe('isTypedArray', () => {
  it('recognizes every typed array kind', () => {
    expect(isTypedArray(new Uint8Array(1))).toBe(true);
    expect(isTypedArray(new Float64Array(1))).toBe(true);
    expect(isTypedArray(new BigInt64Array(1))).toBe(true);
  });

  it('rejects non-typed-array values', () => {
    expect(isTypedArray('a string')).toBe(false);
    expect(isTypedArray(new ArrayBuffer(1))).toBe(false);
    expect(isTypedArray(null)).toBe(false);
  });
});

describe('preprocessOptions', () => {
  it('returns undefined/falsy input unchanged', () => {
    expect(preprocessOptions(undefined)).toBeUndefined();
  });

  it('normalizes type and passes endings through', () => {
    expect(
      preprocessOptions({ type: 'TEXT/Plain', endings: 'native' }),
    ).toEqual({
      type: 'text/plain',
      endings: 'native',
    });
  });

  it('rejects an invalid endings value', () => {
    expect(() => preprocessOptions({ endings: 'bogus' as never })).toThrow(
      /not a valid enum value/,
    );
  });
});
