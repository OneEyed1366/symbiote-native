// resolveImageSourceProp's Android `source` rule. `Image.android.js` lifts headers only from an
// ARRAY source, and ReactImageView never reads per-source headers, so a single `{uri, headers}`
// object sends none. Our write wraps every source in an array; only there is the authored shape
// still visible.

import { describe, expect, it } from 'vitest';

import { resolveImageSourceProp } from './image-source-write';

const HEADERS = { Authorization: 'Bearer t' };

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
