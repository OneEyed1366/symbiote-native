import { describe, expect, it, vi } from 'vitest';

vi.mock('@symbiote-native/engine', () => ({
  resolveAssetSource: (id: number) => ({
    uri: `asset://${id}`,
    width: 1,
    height: 1,
  }),
}));

class FakeSharedRef {
  nativeRefType = 'image';
  __expo_shared_object_id__ = 7;
}

vi.mock('expo-modules-core', () => ({ SharedRef: FakeSharedRef }));

const { resolveSource, resolveSources, isImageRef } = await import('./sources');

describe('resolveSource', () => {
  it('wraps a plain uri string', () => {
    expect(resolveSource('https://x/y.png')).toEqual({
      uri: 'https://x/y.png',
    });
  });

  it('turns an `sf:` string into the `sf:/` uri the native side reads', () => {
    expect(resolveSource('sf:star.fill')).toEqual({ uri: 'sf:/star.fill' });
  });

  it('routes a blurhash string through the hash resolver', () => {
    expect(resolveSource('blurhash:/abc/8/8')).toEqual({
      uri: 'blurhash:/abc',
      width: 8,
      height: 8,
    });
  });

  it('routes a thumbhash string through the hash resolver', () => {
    expect(resolveSource('thumbhash:/abc')).toEqual({ uri: 'thumbhash:/abc' });
  });

  it('resolves a `require`d asset number through the engine', () => {
    expect(resolveSource(3)).toEqual({ uri: 'asset://3', width: 1, height: 1 });
  });

  it('merges a source object `blurhash` under its own fields', () => {
    expect(resolveSource({ blurhash: 'abc', width: 40 })).toEqual({
      uri: 'blurhash:/abc',
      width: 40,
      height: 16,
    });
  });

  it('prefers `thumbhash` over `blurhash` in a source object', () => {
    expect(resolveSource({ blurhash: 'abc', thumbhash: 'xyz' })).toEqual({
      uri: 'thumbhash:/xyz',
    });
  });

  it('keeps a plain source object as is and maps null to null', () => {
    expect(resolveSource({ uri: 'a', headers: { h: '1' } })).toEqual({
      uri: 'a',
      headers: { h: '1' },
    });
    expect(resolveSource(null)).toBeNull();
  });
});

describe('resolveSources', () => {
  it('maps a list and drops entries that resolve to nothing', () => {
    expect(resolveSources(['a', { uri: 'b' }])).toEqual([
      { uri: 'a' },
      { uri: 'b' },
    ]);
  });

  it('wraps a single source in a list and returns an empty list for none', () => {
    expect(resolveSources('a')).toEqual([{ uri: 'a' }]);
    expect(resolveSources(null)).toEqual([]);
  });

  it('hands a shared image ref over as its native object id', () => {
    expect(resolveSources(new FakeSharedRef())).toBe(7);
  });
});

describe('isImageRef', () => {
  it('tells an image shared ref from other values', () => {
    expect(isImageRef(new FakeSharedRef())).toBe(true);
    expect(isImageRef({ nativeRefType: 'image' })).toBe(false);
    expect(isImageRef('x')).toBe(false);
  });
});
