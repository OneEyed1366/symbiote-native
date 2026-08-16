// Unit test for the image-source-resolver seam (mirrors platform-color.ts's
// setColorProcessor/processColor test coverage). Proves the register/resolve round-trip both
// renderImage (@symbiote-native/components) and image-loader's resolveAssetSource static rely on.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// setImageSourceResolver/resolveImageSource never throws — the module's whole contract is a
// mutable single-slot register/run seam, so scenarios are grouped by that seam's two states
// rather than Positive/Negative.
describe('image-source-resolver', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('before a resolver is registered', () => {
    // why: @symbiote-native/components (renderImage) must not depend on react-native, so headless
    // and any host that never wires a real resolver still get a usable (identity) passthrough.
    it('resolveImageSource is the identity', async () => {
      const { resolveImageSource } = await import('./image-source-resolver');
      expect(resolveImageSource(42)).toBe(42);
      const obj = { uri: 'x' };
      expect(resolveImageSource(obj)).toBe(obj);
    });
  });

  describe('after a resolver is registered', () => {
    it('resolveImageSource runs the registered resolver', async () => {
      const { setImageSourceResolver, resolveImageSource } =
        await import('./image-source-resolver');
      setImageSourceResolver(source => ({ uri: `asset://${String(source)}` }));
      expect(resolveImageSource(7)).toEqual({ uri: 'asset://7' });
    });

    // why: the seam is a single mutable slot (not a list/stack of resolvers) — re-registering
    // (e.g. app hot-reload, a test resetting state) must fully replace the prior resolver, not
    // compose with it.
    it('a later registration replaces the earlier one entirely', async () => {
      const { setImageSourceResolver, resolveImageSource } =
        await import('./image-source-resolver');
      setImageSourceResolver(() => 'first');
      setImageSourceResolver(() => 'second');
      expect(resolveImageSource(1)).toBe('second');
    });
  });
});
