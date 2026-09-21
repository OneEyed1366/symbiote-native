import { describe, expect, it } from 'vitest';
import { findClosestMatch } from './suggest.js';

describe('findClosestMatch', () => {
  it('suggests the nearest candidate for a one-letter typo', () => {
    expect(findClosestMatch('nwe', ['new', 'add'])).toBe('new');
  });

  it('suggests the nearest flag for a transposed-letter typo', () => {
    expect(
      findClosestMatch('--frmaework', ['--framework', '--bundle-id']),
    ).toBe('--framework');
  });

  it('returns undefined when nothing is close enough', () => {
    expect(findClosestMatch('xyz987', ['new', 'add'])).toBeUndefined();
  });

  it('returns undefined for an empty candidate list', () => {
    expect(findClosestMatch('new', [])).toBeUndefined();
  });
});
