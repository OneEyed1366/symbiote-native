import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveAssetSource = vi.hoisted(() => vi.fn());

vi.mock('@symbiote-native/engine', async importOriginal => ({
  ...(await importOriginal<object>()),
  resolveAssetSource,
}));

const { parseSource } = await import('./video-source');

beforeEach(() => {
  vi.clearAllMocks();
  resolveAssetSource.mockImplementation((id: unknown) => ({
    uri: `asset://${String(id)}`,
  }));
});

describe('parseSource (Positive)', () => {
  it('turns a string into a uri source', () => {
    expect(parseSource('https://a.test/v.mp4')).toEqual({
      uri: 'https://a.test/v.mp4',
    });
  });

  it('resolves a required asset to its uri', () => {
    expect(parseSource(12)).toEqual({ uri: 'asset://12' });
  });

  it('resolves the assetId of an object that has no uri', () => {
    expect(parseSource({ assetId: 7, useCaching: true })).toEqual({
      assetId: 7,
      useCaching: true,
      uri: 'asset://7',
    });
  });

  it('keeps an object with a uri as it is, even with an assetId', () => {
    const source = { uri: 'https://a.test/v.mp4', assetId: 7 };

    expect(parseSource(source)).toBe(source);
    expect(resolveAssetSource).not.toHaveBeenCalled();
  });

  it('keeps an object that has neither', () => {
    const source = { headers: { a: 'b' } };

    expect(parseSource(source)).toBe(source);
  });

  it('keeps null, it unloads the player', () => {
    expect(parseSource(null)).toBeNull();
  });
});

describe('parseSource (Negative)', () => {
  it('throws when a required asset cannot be resolved', () => {
    resolveAssetSource.mockReturnValue(undefined);

    expect(() => parseSource(12)).toThrow('The asset 12 could not be resolved');
  });
});
