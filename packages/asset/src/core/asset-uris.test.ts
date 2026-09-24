// Ported from expo-asset/src/__tests__/AssetUris-test.ts (sdk-57), minus getManifestBaseUrl
// (dropped — see asset-uris.ts's own header).
import { afterEach, describe, expect, it } from 'vitest';
import { getFileExtension, getFilename } from './asset-uris';

describe('getFilename (Positive)', () => {
  it('gets the filename from a URL', () => {
    const url = 'https://example.com/4bd45bcdf50493e345e817c9281bffbf.png';
    expect(getFilename(url)).toBe('4bd45bcdf50493e345e817c9281bffbf.png');
  });

  it('returns an empty string when the URL has no path', () => {
    expect(getFilename('https://example.com')).toBe('');
  });

  it('returns path with a relative URL', () => {
    expect(getFilename('/assets/foobar.png?platform=web')).toBe('foobar.png');
  });

  it('extracts the filename from a Metro dev-server unstable_path param', () => {
    const url =
      '/assets/?unstable_path=.%2Fsrc%2Fassets%2Fimages%2FPILLAR.png&platform=web&hash=d00faeafda55dca55498cd494a65a83b';
    expect(getFilename(url)).toBe('PILLAR.png');
  });

  describe('production build (__DEV__ = false)', () => {
    afterEach(() => {
      Reflect.set(globalThis, '__DEV__', undefined);
    });

    it('does not extract unstable_path outside a dev build', () => {
      Reflect.set(globalThis, '__DEV__', false);
      const url =
        '/assets?unstable_path=.%2Fsrc%2Fassets%2Fimages%2FPILLAR.png&platform=web&hash=d00faeafda55dca55498cd494a65a83b';
      expect(getFilename(url)).toBe('assets');
    });
  });
});

describe('getFileExtension (Positive)', () => {
  it('gets the file extension from a URL', () => {
    const url = 'https://example.com/4bd45bcdf50493e345e817c9281bffbf.png';
    expect(getFileExtension(url)).toBe('.png');
  });

  it('returns an empty string when there is no extension', () => {
    expect(getFileExtension('https://example.com/')).toBe('');
  });

  it('returns an empty string for a hidden file with no extension', () => {
    expect(getFileExtension('https://example.com/.hidden')).toBe('');
  });

  it('gets the extension for a hidden file with an extension', () => {
    expect(getFileExtension('https://example.com/.hidden.txt')).toBe('.txt');
  });
});
