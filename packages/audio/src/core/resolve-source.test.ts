import { beforeEach, describe, expect, it } from 'vitest';
import { setAssetSourceResolver } from '@symbiote-native/engine';
import { resolveSource, resolveSources } from './resolve-source';

describe('resolveSource', () => {
  beforeEach(() => {
    // reset the shared engine seam to its headless identity default between tests
    setAssetSourceResolver(source => source);
  });

  it('returns null for null/undefined', () => {
    expect(resolveSource(null)).toBeNull();
    expect(resolveSource(undefined)).toBeNull();
  });

  it('wraps a bare string into a { uri } object', () => {
    expect(resolveSource('https://example.com/track.mp3')).toEqual({
      uri: 'https://example.com/track.mp3',
    });
  });

  it('passes an already-object source through unchanged', () => {
    const source = { uri: 'https://example.com/track.mp3', name: 'Track' };
    expect(resolveSource(source)).toBe(source);
  });

  it("resolves a number (require()'d asset) via the engine seam", () => {
    setAssetSourceResolver(source =>
      source === 42 ? { uri: 'file:///mock/asset.mp3' } : source,
    );
    expect(resolveSource(42)).toEqual({ uri: 'file:///mock/asset.mp3' });
  });

  it('returns null when the seam cannot resolve the number', () => {
    setAssetSourceResolver(() => null);
    expect(resolveSource(42)).toBeNull();
  });
});

describe('resolveSources', () => {
  it('resolves each source and drops null entries', () => {
    expect(resolveSources(['a.mp3', null, { uri: 'b.mp3' }])).toEqual([
      { uri: 'a.mp3' },
      { uri: 'b.mp3' },
    ]);
  });
});
