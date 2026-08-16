// Co-located unit test: the commit engine is INCREMENTAL, not a full rebuild. Driving
// the mutation API against the shared fake slot, a commit that changes one sibling re-clones only
// that sibling; the untouched sibling's native handle is reused BY REFERENCE (its native view
// state survives, the whole point of clone-on-write); no createNode happens after first mount;
// and a no-op commit makes zero native calls. The "only the changed branch was cloned" invariant
// is proven structurally by the reused-by-reference handle rather than a clone counter.
//
// The commit engine has no throwing path for these scenarios (a deterministic tree diff), so
// this stays Positive-only. Tests run in file order against ONE shared fabric/surface/tree
// (installFabric installs a process-global slot, so a second instance mid-file would collide
// with this one) — each assertion below is written to hold given only "whatever happened so
// far", not a specific prior test, so reordering within this file stays safe.

import { beforeAll, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { appendChild, createElement, createSurface, setProp } from '../index';

const fabric = installFabric();
const ROOT_TAG = 11;
const surface = createSurface(ROOT_TAG);

const a = createElement('RCTView');
const b = createElement('RCTView');

let mountCreateNode = 0;
let mountCompleteRoot = 0;
let aHandle1: IFakeNode;
let bHandle1: IFakeNode;

beforeAll(() => {
  setProp(a, 'opacity', 1);
  appendChild(a, createElement('RCTView'));
  setProp(b, 'opacity', 1);
  appendChild(b, createElement('RCTView'));

  surface.appendChild(a);
  surface.appendChild(b);
  surface.commit();

  mountCreateNode = fabric.counts.createNode;
  mountCompleteRoot = fabric.counts.completeRoot;
  // committed[0] is the synthetic AppContainer root; A and B are its two children.
  const root = fabric.appRoot();
  aHandle1 = root.children[0];
  bHandle1 = root.children[1];
});

describe('incremental commit', () => {
  it('creates every node once on mount and commits once', () => {
    // synthetic AppContainer root + A, A.child, B, B.child -> 5 createNode.
    expect(mountCreateNode).toBe(5);
    expect(mountCompleteRoot).toBe(1);
  });

  // why: Fabric's persistent tree means a parent HOLDS its children by reference — changing a
  // leaf forces every ANCESTOR up to root to get a fresh clone too (so the parent's child-set
  // reflects the new leaf), not just the leaf itself. B, entirely unrelated to the change, must
  // still be reused by reference: the clone only walks the changed branch's ancestor chain.
  it('changing a deeply nested child clones its ancestor chain, leaving the untouched sibling by reference', () => {
    fabric.reset();
    setProp(a.children[0], 'opacity', 0.2);
    surface.commit();

    expect(fabric.counts.completeRoot).toBe(1);

    const root = fabric.appRoot();
    // A's own handle changes too (its child-set now points at the new leaf clone), even though
    // only its child's prop was touched, never A itself.
    expect(root.children[0]).not.toBe(aHandle1);
    expect(root.children[1]).toBe(bHandle1);
  });

  it('changing one sibling rebuilds nothing and reuses the untouched sibling by reference', () => {
    fabric.reset();
    setProp(a, 'opacity', 0.5);
    surface.commit();

    expect(fabric.counts.createNode).toBe(0);
    expect(fabric.counts.completeRoot).toBe(1);

    const root = fabric.appRoot();
    // B's subtree is never cloned (its handle is reused). This IS "only the changed branch cloned".
    expect(root.children[1]).toBe(bHandle1);
    // A changed, so it gets a fresh handle.
    expect(root.children[0]).not.toBe(aHandle1);
  });

  // why: an ADDITION is structurally different from a prop change (a genuinely new native view
  // must be created) — exactly one createNode should fire for the new child, and the sibling
  // never touched by the mutation must still be reused by reference.
  it('appending a new child to one sibling creates exactly one node and reuses the untouched sibling', () => {
    fabric.reset();
    appendChild(a, createElement('RCTView'));
    surface.commit();

    expect(fabric.counts.createNode).toBe(1);
    expect(fabric.counts.completeRoot).toBe(1);
    expect(fabric.appRoot().children[1]).toBe(bHandle1);
  });

  it('makes zero native calls on a no-op commit', () => {
    fabric.reset();
    surface.commit();
    expect(fabric.counts.completeRoot).toBe(0);
    expect(fabric.counts.createNode).toBe(0);
  });
});
