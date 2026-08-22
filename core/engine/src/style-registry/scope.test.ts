// Unit test for the scoped-style class-name rewriter - a separate responsibility from the CSS
// class registry, see scope.ts's own doc comment. Pure and total (never throws), so there is no
// Negative group — every scenario is a Positive rewrite outcome.

import { describe, expect, it } from 'vitest';
import { renameClassTokens } from './scope';

// The rewriter the Vue SFC compiler emits calls to. It handles the three input shapes
// normalizeClass understands, and the new name is READ from a table the style compiler produced,
// never rebuilt from a scope id — so a token this map does not carry is another file's and must
// survive verbatim, kebab spelling included.
describe('renameClassTokens', () => {
  const renames = {
    card: 'card__data-v-a1b2c3d4',
    'section-label': 'sectionLabel__data-v-a1b2c3d4',
    sectionLabel: 'sectionLabel__data-v-a1b2c3d4',
  };

  it('renames only the tokens the map carries, preserving order', () => {
    expect(renameClassTokens('card foo', renames)).toBe(
      'card__data-v-a1b2c3d4 foo',
    );
  });

  it('renames a kebab-authored token through its own spelling', () => {
    expect(renameClassTokens('section-label', renames)).toBe(
      'sectionLabel__data-v-a1b2c3d4',
    );
  });

  // why: an unmapped token is NOT normalized on the way through. The registry matches class names
  // as authored, so the foreign spelling is exactly what resolves — rewriting it here would be
  // this function claiming knowledge it does not have.
  it('leaves an unmapped kebab token exactly as authored', () => {
    expect(renameClassTokens('foo-bar', renames)).toBe('foo-bar');
  });

  it('renames the keys of a toggle map and the entries of an array', () => {
    expect(renameClassTokens({ card: true, foo: false }, renames)).toEqual({
      'card__data-v-a1b2c3d4': true,
      foo: false,
    });
    expect(renameClassTokens(['card', { foo: true }], renames)).toEqual([
      'card__data-v-a1b2c3d4',
      { foo: true },
    ]);
  });

  it('passes null/undefined through, as normalizeClass would', () => {
    expect(renameClassTokens(null, renames)).toBeNull();
    expect(renameClassTokens(undefined, renames)).toBeUndefined();
  });

  // why: the rewriter runs at every render of a scoped component — mutating the caller's
  // `class`/`:class` value in place would corrupt Vue's own reactive state.
  it('does not mutate the input object or array', () => {
    const inputObject = { card: true, foo: false };
    const inputArray = ['card', { card: true }];
    const objectSnapshot = { ...inputObject };
    const arraySnapshot = [...inputArray];

    const resultObject = renameClassTokens(inputObject, renames);
    const resultArray = renameClassTokens(inputArray, renames);

    expect(inputObject).toEqual(objectSnapshot);
    expect(inputArray).toEqual(arraySnapshot);
    expect(resultObject).not.toBe(inputObject);
    expect(resultArray).not.toBe(inputArray);
  });

  it('an empty string has no tokens to rename and stays empty', () => {
    expect(renameClassTokens('', renames)).toBe('');
  });

  it('an empty array has nothing to recurse into', () => {
    expect(renameClassTokens([], renames)).toEqual([]);
  });
});
