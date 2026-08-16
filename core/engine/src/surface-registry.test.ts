// Unit test for the surface registry: the devtools-inspector building block that tracks
// currently-mounted SymbioteSurface instances with zero adapter-side wiring — createSurface
// registers, disposeRoot (commit.ts) unregisters. Spans surface.ts + commit.ts +
// surface-registry.ts, so it imports the package barrel like host-instance.test.ts does,
// rather than reaching into a single relative module.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSurface,
  disposeRoot,
  getActiveSurfaces,
  SymbioteSurface,
} from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

const ROOT_TAG_A = 101;
const ROOT_TAG_B = 202;

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  // The registry is a module-level singleton, so a surface a previous test created (and
  // never disposed) would otherwise leak into this one's getActiveSurfaces() snapshot.
  for (const surface of getActiveSurfaces()) disposeRoot(surface.rootTag);
});

describe('surface registry', () => {
  it('lists a surface created via createSurface', () => {
    const surface = createSurface(ROOT_TAG_A);
    expect(getActiveSurfaces()).toContain(surface);
  });

  it('drops a surface once its root is disposed', () => {
    const surface = createSurface(ROOT_TAG_A);
    disposeRoot(ROOT_TAG_A);
    expect(getActiveSurfaces()).not.toContain(surface);
  });

  it('tracks multiple surfaces with different root tags independently', () => {
    const surfaceA = createSurface(ROOT_TAG_A);
    const surfaceB = createSurface(ROOT_TAG_B);

    expect(getActiveSurfaces()).toEqual(expect.arrayContaining([surfaceA, surfaceB]));

    disposeRoot(ROOT_TAG_A);
    const remaining = getActiveSurfaces();
    expect(remaining).not.toContain(surfaceA);
    expect(remaining).toContain(surfaceB);
  });

  it('returns a snapshot: mutating a previous result does not affect a later call', () => {
    const surfaceA = createSurface(ROOT_TAG_A);
    const first = getActiveSurfaces();
    // Deliberately strip `readonly` to probe that the snapshot contract holds even
    // against a consumer that mutates despite the type — the returned array must be an
    // independent copy, not a readonly VIEW of the live internal Set. Constructed directly
    // (not via createSurface), so it is never actually registered — proves the push below
    // is purely local to `first`, not a side effect that also touched the registry.
    const unregisteredSurface = new SymbioteSurface(ROOT_TAG_B);
    (first as SymbioteSurface[]).push(unregisteredSurface);

    const second = getActiveSurfaces();
    expect(second).toEqual([surfaceA]);
  });
});
