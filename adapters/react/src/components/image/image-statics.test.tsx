// Coverage scope: `imageStatics` (getSize/getSizeWithHeaders/prefetch/abortPrefetch/queryCache/
// resolveAssetSource) is a framework-agnostic imperative module per <runtime_modules_layering> —
// it lives in @symbiote-native/engine and every adapter re-exports it verbatim. Its own business
// logic (Positive AND Negative — native-module-unavailable rejects, malformed-shape rejects,
// per-platform prefetch arity) is already exhaustively covered by
// core/engine/src/image-loader.test.ts. Re-testing that logic here through the React `Image`
// import would duplicate that suite. This file instead proves ONLY the React-side wiring: that
// `Image.<static>` is the SAME function core exports (Object.assign(ImageComponent, imageStatics)
// didn't wrap, clone, or drop anything), and one live call to prove the composed object is
// actually callable through the React entry point.
//
// No Negative group: there is no React-side logic here to reject anything — the wiring is a
// straight object composition. Every failure mode (native module missing, malformed native
// reply) belongs to imageStatics' own contract, already covered in core/engine/src/image-loader.test.ts.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Image, setImageSourceResolver } from '@symbiote-native/react';
import { imageStatics } from '@symbiote-native/components';

beforeEach(() => {
  // Restore the default identity resolver before each scenario.
  setImageSourceResolver(source => source);
});
afterEach(() => {
  setImageSourceResolver(source => source);
});

describe('Image statics (React entry-point wiring)', () => {
  describe('Positive', () => {
    it('exposes every imageStatics method on Image by identity, not a wrapped copy', () => {
      // why: Object.assign(ImageComponent, imageStatics) must attach the SAME function
      // references — a rewrap or partial copy here would silently desync the React entry point
      // from core's behavior (including the Negative-path guarantees core/engine/src/
      // image-loader.test.ts already proves), without any test noticing at either layer.
      const staticKeys = Object.keys(imageStatics) as Array<keyof typeof imageStatics>;
      expect(staticKeys.length).toBeGreaterThan(0);
      for (const key of staticKeys) {
        expect(Image[key]).toBe(imageStatics[key]);
      }
    });

    it('resolveAssetSource is actually callable through the Image import, using the installed resolver', () => {
      // why: a minimal live call (rather than just an identity check) proves the composed
      // object is genuinely invokable through `Image.*` at runtime, not just structurally equal.
      setImageSourceResolver(() => ({ uri: 'resolved://b.png', scale: 3 }));
      const resolved = Image.resolveAssetSource(42);
      const uri =
        typeof resolved === 'object' && resolved !== null
          ? Reflect.get(resolved, 'uri')
          : undefined;
      expect(uri).toBe('resolved://b.png');
    });
  });
});
