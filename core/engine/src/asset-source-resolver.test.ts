// Unit test for the asset-source-resolver seam (mirrors image-source-resolver.test.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('asset-source-resolver', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('before a resolver is registered', () => {
    it('resolveAssetSource is the identity', async () => {
      const { resolveAssetSource } = await import('./asset-source-resolver');
      expect(resolveAssetSource(42)).toBe(42);
      const obj = { uri: 'x' };
      expect(resolveAssetSource(obj)).toBe(obj);
    });
  });

  describe('after a resolver is registered', () => {
    it('resolveAssetSource runs the registered resolver', async () => {
      const { setAssetSourceResolver, resolveAssetSource } =
        await import('./asset-source-resolver');
      setAssetSourceResolver(source => ({ uri: `asset://${String(source)}` }));
      expect(resolveAssetSource(7)).toEqual({ uri: 'asset://7' });
    });

    // why: single mutable slot, not a list — a later registration must fully replace the earlier
    // one, never compose with it.
    it('a later registration replaces the earlier one entirely', async () => {
      const { setAssetSourceResolver, resolveAssetSource } =
        await import('./asset-source-resolver');
      setAssetSourceResolver(() => 'first');
      setAssetSourceResolver(() => 'second');
      expect(resolveAssetSource(1)).toBe('second');
    });
  });
});
