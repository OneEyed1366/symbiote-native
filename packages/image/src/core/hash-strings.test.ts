import { describe, expect, it } from 'vitest';
import { resolveBlurhashString, resolveThumbhashString } from './hash-strings';

describe('resolveBlurhashString', () => {
  it('turns a bare hash into a blurhash uri with the default 16x16 size', () => {
    expect(resolveBlurhashString('LKO2?Uw=w')).toEqual({
      uri: 'blurhash:/LKO2%3FUw=w',
      width: 16,
      height: 16,
    });
  });

  it('reads the size from the trailing path segments', () => {
    expect(resolveBlurhashString('blurhash:/abc/32/24')).toEqual({
      uri: 'blurhash:/abc',
      width: 32,
      height: 24,
    });
  });

  it('escapes `#` so the hash survives as a uri path', () => {
    expect(resolveBlurhashString('a#b').uri).toBe('blurhash:/a%23b');
  });
});

describe('resolveThumbhashString', () => {
  it('drops the scheme and swaps slashes for backslashes', () => {
    expect(resolveThumbhashString('thumbhash:/ab/cd')).toEqual({
      uri: 'thumbhash:/ab%5Ccd',
    });
  });

  it('accepts a bare hash', () => {
    expect(resolveThumbhashString('abcd')).toEqual({ uri: 'thumbhash:/abcd' });
  });
});
