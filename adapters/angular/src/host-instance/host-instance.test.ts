// Co-located test for findNodeHandle, the Angular twin of adapters/vue/src/host-instance/host-instance.test.ts.
// The source's own header documents 5 accepted input shapes: a bare number, an engine host
// node / public instance (same identity via the toPublicInstance graft — no separate wrapper
// object), an Angular ElementRef wrapping the host node, a SymbiotePrimitiveHost component
// instance (the REAL shape an Angular template ref like `<View #myView>` actually produces —
// see index.ts's top comment), and null/undefined. All five are exercised below; the previous
// version of this file only covered 3 of the 5 (missing ElementRef and the component-instance
// wrapper, arguably the most-used real-world path).
//
// Coverage dictionary (adapters/angular/src/host-instance/index.ts):
//   findNodeHandle — number branch: covered. null/undefined branch: covered. delegates-to-
//     resolveHostNode branch: covered (every other test).
//   resolveHostNode — null/undefined: covered. isSymbioteNode (raw node / public instance
//     identity): covered. `instanceof ElementRef` unwrap: covered. structural
//     `nativeElement`-getter unwrap: covered. falls-through-to-null (no recognized shape):
//     covered ('not-a-node', `{}`). The RECOGNIZED-but-uncommitted node — `isSymbioteNode` true,
//     `getNativeTag` returns `undefined` — is a SEPARATE logical outcome from "unrecognized
//     input" and is covered by "returns null for a recognized engine node that has never been
//     committed" below (missing before this rewrite; the doc comment names it explicitly but no
//     test constructed the scenario).

import { ElementRef } from '@angular/core';
import { describe, expect, it } from 'vitest';
import {
  createElement,
  createSurface,
  getNativeTag,
} from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';
import { findNodeHandle } from './index';

installFabric();
const ROOT_TAG = 708;

async function committedNode(
  rootTag: number,
): Promise<ReturnType<typeof createElement>> {
  const surface = createSurface(rootTag);
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  return node;
}

// findNodeHandle has no throwing path (resolveHostNode falls through to `null` for anything it
// doesn't recognize) — Positive covers every input the doc comment promises resolves to a real
// tag; the second group covers what the doc comment promises resolves to `null` instead of
// throwing, under its own name since "null" is the correct, non-error outcome here.
describe('Angular findNodeHandle on the engine', () => {
  describe('Positive — resolves every documented instance shape to its committed native tag', () => {
    // why: a raw engine node IS what createElement/routeProp/getNativeTag all operate on
    // directly — this is the base case every other resolution path (ElementRef, component
    // instance) ultimately unwraps down to.
    it('returns the committed tag for a raw engine node', async () => {
      const node = await committedNode(ROOT_TAG);
      const tag = getNativeTag(node);
      expect(tag).toBeGreaterThan(0);
      expect(findNodeHandle(node)).toBe(tag);
    });

    // why: the toPublicInstance graft (symbiote-new-adapter skill) attaches measure/focus/
    // setNativeProps onto the SAME engine node object rather than wrapping it — so a "public
    // instance" a consumer holds is identity-equal to the raw node, and isSymbioteNode must
    // recognize it on the FIRST branch of resolveHostNode, not fall through to the
    // nativeElement-unwrap branches meant for a genuinely different wrapper shape.
    it('returns the committed tag for a public instance (toPublicInstance graft)', async () => {
      const node = await committedNode(ROOT_TAG + 1);
      const tag = getNativeTag(node);
      const publicInstance = node;
      expect(findNodeHandle(publicInstance)).toBe(tag);
    });

    // why: this is the shape `@ViewChild(View, { read: ElementRef })` or a directive's injected
    // `ElementRef` actually produces in real Angular code — resolveHostNode must unwrap
    // `.nativeElement` off it, not treat the ElementRef wrapper itself as an unknown input.
    it('unwraps an Angular ElementRef to the tag of the node it wraps', async () => {
      const node = await committedNode(ROOT_TAG + 2);
      const tag = getNativeTag(node);
      const elementRef = new ElementRef(node);
      expect(findNodeHandle(elementRef)).toBe(tag);
    });

    // why: this is what an Angular template ref on a bare primitive actually resolves to per
    // index.ts's own header comment — `<View #myView>` hands the CONSUMER
    // SymbiotePrimitiveHost's component instance, not the engine node directly. Any object
    // exposing a `nativeElement` getter (real or duck-typed) must resolve the same way, since
    // resolveHostNode's structural check (`typeof maybeHost.nativeElement !== 'undefined'`) has
    // no way to distinguish the real class from a shape-alike.
    it('unwraps a SymbiotePrimitiveHost-shaped instance via its nativeElement getter', async () => {
      const node = await committedNode(ROOT_TAG + 3);
      const tag = getNativeTag(node);
      const hostLike = {
        get nativeElement(): unknown {
          return node;
        },
      };
      expect(findNodeHandle(hostLike)).toBe(tag);
    });

    // why: RN's own findNodeHandle contract passes a bare reactTag straight through — some
    // callers already hold the numeric tag (e.g. from a previous findNodeHandle call) and must
    // be able to re-pass it without a special case.
    it('passes a bare number through idempotently', () => {
      expect(findNodeHandle(42)).toBe(42);
    });
  });

  describe('falls back to null for anything it cannot resolve to a real host node', () => {
    // why: null/undefined must not throw (a ref that hasn't attached yet is a normal, common
    // state, not an error), and neither should a value that merely LOOKS like input but isn't
    // resolvable — an uncommitted/unknown/malformed value silently returning null (rather than
    // throwing) matches RN's own findNodeHandle contract for a stale or foreign ref.
    it('returns null for null, undefined, and unrecognized inputs', () => {
      expect(findNodeHandle(null)).toBeNull();
      expect(findNodeHandle(undefined)).toBeNull();
      expect(findNodeHandle('not-a-node')).toBeNull();
      expect(findNodeHandle({})).toBeNull();
    });

    // why: the source's own header comment names this as its OWN distinct documented outcome
    // ("An uncommitted or unknown input surfaces as null") — a RECOGNIZED engine node with no
    // tag yet (created but never appended/committed to a surface, e.g. a ref read during the
    // same tick it was constructed) is a real, common transient state, not a malformed input,
    // and it must resolve the same way `getNativeTag`'s own `?? null` fallback documents rather
    // than throwing on a missing `mirror` entry. None of the other tests in this file exercise
    // a genuinely uncommitted node — every "Positive" case commits first.
    it('returns null for a recognized engine node that has never been committed', () => {
      const node = createElement('RCTView');
      expect(getNativeTag(node)).toBeUndefined();
      expect(findNodeHandle(node)).toBeNull();
    });
  });
});
