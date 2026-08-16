// Runtime guards narrowing `unknown` at trust boundaries (native payloads, ViewConfig
// attributes, style values) without an `as` cast. Every guard is total (typeof-based, never
// throws), so there is no Negative (toThrow) group — the "rejects" describes below play that
// role: a guard signals rejection by returning `false`, not by throwing.

import { describe, expect, it } from 'vitest';
import { isBoolean, isNumber, isRecord, isString } from './type-guards';

describe('isRecord', () => {
  it('accepts a plain object', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  // why: most call sites read isRecord as "a native payload keyed by string", never a list —
  // an array must be rejected even though `typeof [] === 'object'`, or a caller would read
  // array indices as if they were named keys.
  it('rejects an array (the stricter, canonical behavior)', () => {
    expect(isRecord([1, 2, 3])).toBe(false);
    expect(isRecord([])).toBe(false);
  });

  // why: `typeof null === 'object'` is JS's oldest footgun; a native payload can legitimately
  // be null (a missing/absent field), and that must not be misread as a valid record.
  it('rejects null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('rejects primitives', () => {
    expect(isRecord('x')).toBe(false);
    expect(isRecord(1)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe('isBoolean', () => {
  it('accepts true/false', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
  });

  it('rejects non-booleans', () => {
    expect(isBoolean(0)).toBe(false);
    expect(isBoolean('true')).toBe(false);
    expect(isBoolean(null)).toBe(false);
    expect(isBoolean(undefined)).toBe(false);
  });
});

describe('isNumber', () => {
  // why: the guard is a `typeof` check, not a validity check — a caller that needs a FINITE
  // number (e.g. touch-history's coordinate guards) layers its own `Number.isFinite` on top;
  // isNumber alone must not silently filter out NaN, or that distinction would be lost here.
  it('accepts numbers, including NaN (typeof-correct, not value-correct)', () => {
    expect(isNumber(0)).toBe(true);
    expect(isNumber(-1.5)).toBe(true);
    expect(isNumber(Number.NaN)).toBe(true);
  });

  it('rejects non-numbers', () => {
    expect(isNumber('1')).toBe(false);
    expect(isNumber(null)).toBe(false);
    expect(isNumber(undefined)).toBe(false);
  });
});

describe('isString', () => {
  it('accepts strings', () => {
    expect(isString('')).toBe(true);
    expect(isString('hello')).toBe(true);
  });

  it('rejects non-strings', () => {
    expect(isString(1)).toBe(false);
    expect(isString(null)).toBe(false);
    expect(isString(undefined)).toBe(false);
  });
});
