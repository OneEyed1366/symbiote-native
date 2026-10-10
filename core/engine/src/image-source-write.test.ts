// resolveImageSourceProp's Android `source` rule: RN lifts headers only from an array source, so
// a single `{uri, headers}` object sends none — only visible once the write wraps it in an array.

import { describe, expect, it, vi } from 'vitest';

import {
  resolveImageSourceProp,
  warnOnBadSrcSet,
  warnOnEmptyImageUri,
} from './image-source-write';

const HEADERS = { Authorization: 'Bearer t' };
const EMPTY_URI_WARNING = 'source.uri should not be an empty string';

describe('warnOnEmptyImageUri', () => {
  // RN предупреждает на каждой записи единственного `source`, `Image.ios.js:131`
  it('warns about an empty uri of a single source', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      warnOnEmptyImageUri('source', { uri: '' });
      expect(warn).toHaveBeenCalledWith(EMPTY_URI_WARNING);
    } finally {
      warn.mockRestore();
    }
  });

  it('stays quiet for a real uri, an array source and a placeholder prop', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      warnOnEmptyImageUri('source', { uri: 'https://a/1.png' });
      warnOnEmptyImageUri('source', [{ uri: '' }]);
      warnOnEmptyImageUri('defaultSource', { uri: '' });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('warnOnBadSrcSet', () => {
  const SCALE_WARNING =
    'The provided format for scale is not supported yet. Please use scales like 1x, 2x, etc.';
  const INVALID_WARNING = 'The provided value for srcSet is not valid.';

  function warnings(key: string, value: unknown): unknown[][] {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      warnOnBadSrcSet(key, value);
      return warn.mock.calls;
    } finally {
      warn.mockRestore();
    }
  }

  // `ImageSourceUtils.js:57-59`, и пустой итог тоже предупреждает (`:76`)
  it('warns about a scale that is not `<n>x`, and about the empty result', () => {
    expect(warnings('srcSet', 'uri1 300w')).toEqual([
      [SCALE_WARNING],
      [INVALID_WARNING],
    ]);
  });

  it('warns once per unsupported entry and keeps the good ones quiet', () => {
    expect(warnings('srcSet', 'uri1 300w, uri2')).toEqual([[SCALE_WARNING]]);
  });

  // `parseInt('abcx')` это NaN, запись пропускается без слов, но пустой итог предупреждает
  it('skips a NaN scale silently', () => {
    expect(warnings('srcSet', 'uri1 abcx')).toEqual([[INVALID_WARNING]]);
  });

  it('stays quiet for a valid set and for other props', () => {
    expect(warnings('srcSet', 'uri1 1x, uri2 2x')).toEqual([]);
    expect(warnings('src', 'uri1 300w')).toEqual([]);
    expect(warnings('srcSet', undefined)).toEqual([]);
  });
});

describe('resolveImageSourceProp — Android single-object source', () => {
  // why: RN Android drops a single object source's headers (Image.android.js lifts only arrays).
  it('drops the headers of a single object source', () => {
    expect(
      resolveImageSourceProp(
        { uri: 'https://a/1.png', headers: HEADERS },
        true,
      ),
    ).toEqual([{ uri: 'https://a/1.png' }]);
  });

  // why: an authored ARRAY is an array in RN too, so its first entry's headers are lifted there.
  it('keeps the headers of an authored source array', () => {
    expect(
      resolveImageSourceProp(
        [{ uri: 'https://a/1.png', headers: HEADERS }],
        true,
      ),
    ).toEqual([{ uri: 'https://a/1.png', headers: HEADERS }]);
  });

  // why: iOS reads headers from the source itself (RCTImageLoader), so nothing is dropped there.
  it('keeps single-object headers when the rule is off', () => {
    expect(
      resolveImageSourceProp(
        { uri: 'https://a/1.png', headers: HEADERS },
        false,
      ),
    ).toEqual([{ uri: 'https://a/1.png', headers: HEADERS }]);
  });
});
