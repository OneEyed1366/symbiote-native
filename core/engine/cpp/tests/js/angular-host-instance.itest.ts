// findNodeHandle against the REAL committed Fabric tag, replacing
// adapters/angular/src/host-instance/host-instance.test.ts's `installFabric()` half. That mirror
// assigned each node a unique, sequential fake tag, so `getNativeTag(node) === expected` was a real
// claim there. The recording host does the opposite on purpose — every node reads back the same
// `NO_TAG` sentinel — so the identical assertion under `installRecordingFabric()` compares two
// sentinels and proves nothing (mirror-elimination.md, "A tag comparison whose two sides are both
// NO_TAG sentinels proves nothing"). `resolveHostNode`'s unwrap logic (ElementRef, the
// SymbiotePrimitiveHost `nativeElement` shape, the public-instance graft) is plain JS with no
// Angular renderer involved, so this drives the raw engine mutation API directly — the same shape
// the original test used — rather than mounting through the Angular adapter.

import '@angular/compiler';
import { ElementRef } from '@angular/core';
import {
  createElement,
  createSurface,
  getNativeTag,
} from '@symbiote-native/engine';
import { findNodeHandle } from '@symbiote-native/angular';

import { describe, expect, it, report } from './harness';

let nextRootTag = 1;

function committedNode(): ReturnType<typeof createElement> {
  const surface = createSurface(nextRootTag);
  nextRootTag += 1;
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

describe('Angular findNodeHandle on the real engine', () => {
  describe('Positive — resolves every documented instance shape to its committed native tag', () => {
    it('returns the committed tag for a raw engine node', () => {
      const node = committedNode();
      const tag = getNativeTag(node);
      expect(typeof tag === 'number' && tag > 0).toBe(true);
      expect(findNodeHandle(node)).toBe(tag);
    });

    it('returns the committed tag for a public instance (toPublicInstance graft)', () => {
      const node = committedNode();
      const tag = getNativeTag(node);
      expect(findNodeHandle(node)).toBe(tag);
    });

    it('unwraps an Angular ElementRef to the tag of the node it wraps', () => {
      const node = committedNode();
      const tag = getNativeTag(node);
      const elementRef = new ElementRef(node);
      expect(findNodeHandle(elementRef)).toBe(tag);
    });

    it('unwraps a SymbiotePrimitiveHost-shaped instance via its nativeElement getter', () => {
      const node = committedNode();
      const tag = getNativeTag(node);
      const hostLike = {
        get nativeElement(): unknown {
          return node;
        },
      };
      expect(findNodeHandle(hostLike)).toBe(tag);
    });

    it('passes a bare number through idempotently', () => {
      expect(findNodeHandle(42)).toBe(42);
    });
  });

  describe('falls back to null for anything it cannot resolve to a real host node', () => {
    it('returns null for null, undefined, and unrecognized inputs', () => {
      expect(findNodeHandle(null)).toBe(null);
      expect(findNodeHandle(undefined)).toBe(null);
      expect(findNodeHandle('not-a-node')).toBe(null);
      expect(findNodeHandle({})).toBe(null);
    });

    it('returns null for a recognized engine node that has never been committed', () => {
      const node = createElement('RCTView');
      expect(getNativeTag(node)).toBe(undefined);
      expect(findNodeHandle(node)).toBe(null);
    });
  });
});

report();
