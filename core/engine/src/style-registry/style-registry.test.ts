// Unit test for the style registry. Each test registers its own
// styles and clearGlobalStyles() in beforeEach isolates them from one another.
//
// resolveClassName has no throwing path — every input, including a malformed one, resolves to
// a style object or `{}`. There is no Negative group here for that reason; the second group
// below is named "returns empty" (the unit's real contract) instead.

import { beforeEach, describe, expect, it } from 'vitest';
import { isClassNameValue, registerStyles, resolveClassName, clearGlobalStyles } from './index';

describe('style-registry', () => {
  beforeEach(() => {
    clearGlobalStyles();
  });

  describe('resolves a match', () => {
    it('resolves an exact registered class name', () => {
      registerStyles({ foo: { color: 'red' } });
      expect(resolveClassName('foo')).toEqual({ color: 'red' });
    });

    it('merges an array of registered class names, later wins on collision', () => {
      registerStyles({
        a: { color: 'red', padding: 1 },
        b: { color: 'blue' },
      });
      expect(resolveClassName(['a', 'b'])).toEqual({ color: 'blue', padding: 1 });
    });

    // why: an adapter's class/className prop can arrive as a mixed array (`class="foo"` plus an
    // inline style object literal, e.g. Vue's `:class="[cls, { color: 'x' }]"`) — a registered
    // name and a raw style object must merge exactly like two registered names do.
    it('merges a registered class name with a raw style object in the same array', () => {
      registerStyles({ foo: { color: 'red' } });
      expect(resolveClassName(['foo', { padding: 4 }])).toEqual({ color: 'red', padding: 4 });
    });

    it('passes an object through unchanged', () => {
      expect(resolveClassName({ color: 'red' })).toEqual({ color: 'red' });
    });

    it('finds a compound permutation for a multi-part class string', () => {
      registerStyles({ btnPrimary: { color: 'white', padding: 8 } });
      expect(resolveClassName('btn primary')).toEqual({ color: 'white', padding: 8 });
    });

    it('falls back to per-class merge when no compound is registered, later class wins', () => {
      registerStyles({
        a: { color: 'red' },
        b: { color: 'blue' },
        c: { padding: 4 },
      });
      expect(resolveClassName('a b c')).toEqual({ color: 'blue', padding: 4 });
    });

    // why: a `$style.card`-style output (Vue CSS Modules proxy) can arrive already composed
    // into one string that is ITSELF a registered key, spaces included — that has to resolve as
    // one exact lookup, not get torn apart into per-token merge/compound resolution first.
    it('resolves a class string containing a space as one exact key before trying to split it', () => {
      registerStyles({ 'a b': { color: 'green' } });
      expect(resolveClassName('a b')).toEqual({ color: 'green' });
    });

    it('resolves a kebab-case class name against its camelCase registered key', () => {
      registerStyles({ sectionLabel: { color: 'red' } });
      expect(resolveClassName('section-label')).toEqual({ color: 'red' });
    });

    it('resolves a kebab-case class name inside a multi-class string, later class wins', () => {
      registerStyles({ sectionLabel: { color: 'red' }, infoText: { color: 'blue' } });
      expect(resolveClassName('section-label info-text')).toEqual({ color: 'blue' });
    });

    it('prefers a literal exact-key match over the kebab->camel fallback when both exist', () => {
      registerStyles({ 'section-label': { color: 'green' }, sectionLabel: { color: 'red' } });
      expect(resolveClassName('section-label')).toEqual({ color: 'green' });
    });

    it('layers a compound rule over the single-class rules instead of replacing them', () => {
      registerStyles({
        card: { padding: 8, backgroundColor: 'white' },
        cardBig: { padding: 16 },
      });
      expect(resolveClassName('card big')).toEqual({ padding: 16, backgroundColor: 'white' });
    });
  });

  describe('returns empty — the real contract for "no match", not an error', () => {
    it('returns an empty style for an unregistered class name', () => {
      expect(resolveClassName('missing')).toEqual({});
    });

    it('returns an empty style for undefined, null, and an empty string', () => {
      expect(resolveClassName(undefined)).toEqual({});
      expect(resolveClassName(null)).toEqual({});
      expect(resolveClassName('')).toEqual({});
    });

    // why: distinct branch from the plain empty-string case above — this goes through trim()
    // rather than the leading falsy-value guard, and must land on the same empty result.
    it('returns an empty style for a whitespace-only string', () => {
      expect(resolveClassName('   ')).toEqual({});
    });

    it('clears prior registrations', () => {
      registerStyles({ foo: { color: 'red' } });
      clearGlobalStyles();
      expect(resolveClassName('foo')).toEqual({});
    });
  });
});

// isClassNameValue narrows an `unknown` prop value at the routeProp boundary before
// resolveClassName ever sees it (a class/className prop can arrive as literally anything, since
// any adapter can hand over anything). No throwing path — it is a total predicate over `unknown`.
describe('isClassNameValue', () => {
  it('accepts a string', () => {
    expect(isClassNameValue('foo')).toBe(true);
  });

  it('accepts a plain object', () => {
    expect(isClassNameValue({ color: 'red' })).toBe(true);
  });

  it('accepts an array', () => {
    expect(isClassNameValue(['foo', { color: 'red' }])).toBe(true);
  });

  // why: `typeof null === 'object'` in JS — the guard has to reject null explicitly, or every
  // component with no class/className prop at all would get treated as a valid style object.
  it('rejects null even though typeof null is "object"', () => {
    expect(isClassNameValue(null)).toBe(false);
  });

  it('rejects undefined, a number, and a boolean', () => {
    expect(isClassNameValue(undefined)).toBe(false);
    expect(isClassNameValue(42)).toBe(false);
    expect(isClassNameValue(true)).toBe(false);
  });
});

// A `<style scoped>` block suffixes the class it registers ONCE, at the end of the collapsed
// key (`.card.big` -> `cardBig__svelte-h`), while the markup it rewrites carries the suffix on
// EVERY token (`class="card__svelte-h big__svelte-h"`). Appending per token and concatenating
// tokens do not commute, so the key built naively from the tokens can never match — every scoped
// compound rule was silently dead. Both scope prefixes in use are covered: `svelte-` and Vue's
// `data-v-`.
describe('style-registry — scoped class names', () => {
  beforeEach(() => {
    clearGlobalStyles();
  });

  it('resolves a compound rule registered under the collapsed, once-suffixed key', () => {
    registerStyles({ 'cardBig__svelte-1a2b3c4d': { padding: 16 } });
    expect(resolveClassName('card__svelte-1a2b3c4d big__svelte-1a2b3c4d')).toEqual({ padding: 16 });
  });

  it('does the same for a Vue data-v- scope', () => {
    registerStyles({ 'btnPrimary__data-v-9z8y7x': { color: 'white' } });
    expect(resolveClassName('btn__data-v-9z8y7x primary__data-v-9z8y7x')).toEqual({
      color: 'white',
    });
  });

  it('does not factor out a suffix two different scopes do not share', () => {
    registerStyles({ 'cardBig__svelte-1a2b3c4d': { padding: 16 } });
    expect(resolveClassName('card__svelte-1a2b3c4d big__svelte-99999999')).toEqual({});
  });

  it('layers a scoped class over a global rule of the same base name', () => {
    // The web equivalent is one element carrying `class="card svelte-h"`, where App.css's
    // `.card` still applies underneath the component's own rule. Here the scope is expressed by
    // renaming the token, so the base has to be re-consulted explicitly.
    registerStyles({
      card: { padding: 8, backgroundColor: 'white' },
      'card__svelte-1a2b3c4d': { padding: 12 },
    });
    expect(resolveClassName('card__svelte-1a2b3c4d')).toEqual({
      padding: 12,
      backgroundColor: 'white',
    });
  });

  it('never reads a BEM class as a scoped one', () => {
    // `card__title` splits at `__` exactly like a scoped token does; only the suffix SHAPE
    // separates them. Merging `.card` into `.card__title` here would be a silent, wrong cascade.
    registerStyles({ card: { padding: 8 }, card__title: { color: 'red' } });
    expect(resolveClassName('card__title')).toEqual({ color: 'red' });
  });
});
