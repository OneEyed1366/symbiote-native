// Co-located unit test: `flattenStyle` is pure and total (never throws), so there is no
// Negative group — every scenario below is a Positive shape-collapse outcome.

import { describe, expect, it } from 'vitest';
import { flattenStyle } from './index';

describe('flattenStyle', () => {
  // why: RN's `style={[base, override]}` idiom depends on later-wins; getting this backwards
  // would silently apply the wrong override in every component that composes styles.
  it('merges an array with later-wins', () => {
    expect(flattenStyle([{ a: 1, b: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 });
  });

  it('recurses into nested arrays', () => {
    expect(flattenStyle([[{ a: 1 }], [{ a: 2 }]])).toEqual({ a: 2 });
  });

  // why: `style={[base, cond && extra]}` is the standard conditional-style idiom — a false/
  // null/undefined entry must contribute nothing rather than throw or pollute the result.
  it('skips falsy entries', () => {
    expect(flattenStyle([null, false, { a: 1 }, undefined])).toEqual({ a: 1 });
  });

  // why: flatten recurses on the style POSITION only, never a property VALUE — `transform`'s
  // array value (and `shadowOffset`'s object value) must pass through untouched, or an
  // animated transform array would get mistaken for a style array and shredded.
  it('passes array property values through untouched', () => {
    expect(flattenStyle({ transform: [{ translateX: 5 }] })).toEqual({
      transform: [{ translateX: 5 }],
    });
  });

  it('flattens a non-object to {}', () => {
    expect(flattenStyle(42)).toEqual({});
  });

  // why: null is `typeof 'object'` in JS — a style prop left `null` (common for an
  // unconditionally-declared optional style) must degrade to an empty object like any other
  // non-record, not be misread as a record.
  it('flattens null to {}', () => {
    expect(flattenStyle(null)).toEqual({});
  });

  it('flattens an empty array to {}', () => {
    expect(flattenStyle([])).toEqual({});
  });

  // why: a shallow copy must not alias the input — mutating the flattened result (which the
  // commit path does when applying preprocessors) must never corrupt the caller's own style
  // object.
  it('does not mutate or alias the input object', () => {
    const input = { a: 1 };
    const result = flattenStyle(input);
    result.a = 999;
    expect(input.a).toBe(1);
  });
});
