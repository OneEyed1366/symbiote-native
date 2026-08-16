// Unit test for the Vue `<style scoped>` class-name rewriter - a separate responsibility
// from the CSS class registry, see scope.ts's own doc comment. Pure and total (never throws),
// so there is no Negative group — every scenario is a Positive rewrite outcome.

import { describe, expect, it } from 'vitest';
import { scopeClassName } from './scope';

describe('scopeClassName', () => {
  const localNames = new Set(['card']);

  // why: `<style scoped>`'s entire point is that a LOCAL class collides safely with a class
  // of the same name elsewhere in the app; only tokens the compiler registered as local get
  // suffixed, everything else (globals, external classes) must pass through untouched.
  it('suffixes only the local token in a string, preserving order and spacing', () => {
    expect(scopeClassName('card foo', localNames, 'a1b2c3d4')).toBe('card__a1b2c3d4 foo');
  });

  it('normalizes repeated/multiple whitespace to single-space-joined tokens', () => {
    expect(scopeClassName('card   foo\tbar', localNames, 'a1b2c3d4')).toBe(
      'card__a1b2c3d4 foo bar',
    );
  });

  // why: Vue's `:class="{ card: isActive }"` toggle-map form is as common as the plain string
  // form; the KEY (not the boolean) is the class name that must be scoped, and the boolean
  // must survive unchanged for Vue's own normalizeClass to read afterward.
  it('rewrites only the local key of a toggle-map object, preserving boolean values', () => {
    const input = { card: true, foo: false };
    expect(scopeClassName(input, localNames, 'a1b2c3d4')).toEqual({
      card__a1b2c3d4: true,
      foo: false,
    });
  });

  it('recurses per element of a mixed string/toggle-map array', () => {
    const input = ['card base', { card: true, foo: false }];
    expect(scopeClassName(input, localNames, 'a1b2c3d4')).toEqual([
      'card__a1b2c3d4 base',
      { card__a1b2c3d4: true, foo: false },
    ]);
  });

  it('passes null and undefined through unchanged', () => {
    expect(scopeClassName(null, localNames, 'a1b2c3d4')).toBeNull();
    expect(scopeClassName(undefined, localNames, 'a1b2c3d4')).toBeUndefined();
  });

  // why: the css-parser registers scoped classes by their camelCase key, but SFC authors may
  // still write kebab-case in `class="section-label"` — the rewriter must normalize BEFORE
  // consulting localNames or a kebab-written local class would be missed entirely.
  it('recognizes a kebab-case token against the camelCase localNames set, emitting the camel form', () => {
    const camelLocalNames = new Set(['sectionLabel']);
    expect(scopeClassName('section-label foo', camelLocalNames, 'a1b2c3d4')).toBe(
      'sectionLabel__a1b2c3d4 foo',
    );
  });

  // why: resolveClassName's runtime registry only ever has camelCase keys, so even an
  // UNSCOPED kebab-case token must be normalized, or the later exact-match lookup would miss
  // a class that is genuinely registered under its camelCase name.
  it('normalizes an untouched (non-local) kebab-case token to camelCase too', () => {
    expect(scopeClassName('card foo-bar', localNames, 'a1b2c3d4')).toBe('card__a1b2c3d4 fooBar');
  });

  it('recognizes a kebab-case toggle-map key against camelCase localNames', () => {
    const camelLocalNames = new Set(['sectionLabel']);
    const input = { 'section-label': true, 'other-thing': false };
    expect(scopeClassName(input, camelLocalNames, 'a1b2c3d4')).toEqual({
      sectionLabel__a1b2c3d4: true,
      otherThing: false,
    });
  });

  // why: the rewriter runs at every render of a scoped component — mutating the caller's
  // `class`/`:class` value in place would corrupt Vue's own reactive state.
  it('does not mutate the input object or array', () => {
    const inputObject = { card: true, foo: false };
    const inputArray = ['card', { card: true }];
    const objectSnapshot = { ...inputObject };
    const arraySnapshot = [...inputArray];

    const resultObject = scopeClassName(inputObject, localNames, 'a1b2c3d4');
    const resultArray = scopeClassName(inputArray, localNames, 'a1b2c3d4');

    expect(inputObject).toEqual(objectSnapshot);
    expect(inputArray).toEqual(arraySnapshot);
    expect(resultObject).not.toBe(inputObject);
    expect(resultArray).not.toBe(inputArray);
  });

  it('an empty string has no tokens to scope and stays empty', () => {
    expect(scopeClassName('', localNames, 'a1b2c3d4')).toBe('');
  });

  it('an empty array has nothing to recurse into', () => {
    expect(scopeClassName([], localNames, 'a1b2c3d4')).toEqual([]);
  });
});
