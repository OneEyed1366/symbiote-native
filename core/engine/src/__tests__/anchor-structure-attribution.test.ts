// A structural edit under an ANCHOR must be attributed to the nearest RENDERABLE ancestor, because
// that is the node whose committed child list just went stale.
//
// An anchor never becomes a Fabric view: `renderableChildren` (commit.ts) flattens it away and its
// children take its place in the child list of the first non-anchor node above it. So
// `markStructureDirty(anchor)` names a node the commit will never look at, while the node that
// actually changed looks untouched.
//
// FOUND 2026-09-05 while designing the buffer drain, by asking which node carries the record — not
// by a failing test, because no test had this shape. It is NOT a regression of the edit buffer:
// `markStructureDirty` has always been called on the direct parent and anchors have always been
// flattened, so the same hole existed for as long as both have.
//
// WHAT IT COST, and why it is quiet. The general commit re-derives `renderableChildren` on every
// node it visits and compares against the snapshot, so it repairs itself and never noticed.
// `commitTargeted` does not re-derive — rebuilding an ancestor's child set from `record.children`
// is exactly why that route is cheap — so it committed a tree the retained tree does not describe,
// with nothing red. Measured before the fix: the appended node was ABSENT after the targeted
// commit and present again after the next general one, i.e. silently one commit late, and
// indefinitely late when nothing else asks for a commit (a native-event write — `setNodePressed`,
// an Animated frame — has no framework commit following it).
//
// The two blocks below fail differently on purpose. The first is about the RECORD and fails as a
// boolean; the second is about the COMMITTED TREE and fails as a missing node. A single mistake can
// produce either alone, so the pair demands the cause rather than one of its symptoms.

import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  appendChild,
  createAnchor,
  createElement,
  createSurface,
  setNativeProps,
  setProp,
} from '../index';
import { hasPendingStructure } from '../edit-buffer';

const fabric = installFabric();

function testIDs(nodes: readonly IFakeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly IFakeNode[]): void => {
    for (const node of list) {
      if (typeof node.props.testID === 'string') out.push(node.props.testID);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

function view(testID: string): ReturnType<typeof createElement> {
  const node = createElement('RCTView');
  setProp(node, 'testID', testID);
  return node;
}

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

describe('the record names the node whose renderable child list changed', () => {
  it('attributes an edit under one anchor to the parent above it', () => {
    const surface = createSurface(6101);
    const parent = view('parent');
    const anchor = createAnchor();
    appendChild(parent, anchor);
    surface.appendChild(parent);
    surface.commit();
    // The control: after a commit nothing is pending, so a `true` below is this append's doing and
    // not a leftover. Without it the assertion passes on a buffer that never drains.
    expect(hasPendingStructure(parent)).toBe(false);

    appendChild(anchor, view('fresh'));

    expect(hasPendingStructure(parent)).toBe(true);
  });

  it('walks past NESTED anchors, which is the common shape on Angular', () => {
    // One anchor per composed component, so an anchor's parent is very often another anchor. A
    // one-step fix passes the case above and fails here, which is why this row exists separately.
    const surface = createSurface(6102);
    const parent = view('parent');
    const outer = createAnchor();
    const inner = createAnchor();
    appendChild(parent, outer);
    appendChild(outer, inner);
    surface.appendChild(parent);
    surface.commit();
    expect(hasPendingStructure(parent)).toBe(false);

    appendChild(inner, view('fresh'));

    expect(hasPendingStructure(parent)).toBe(true);
  });
});

describe('a targeted commit publishes a node appended under an anchor', () => {
  it('commits it in the SAME flush, not one commit later', async () => {
    fabric.reset();
    const surface = createSurface(6103);
    const parent = view('parent');
    const anchor = createAnchor();
    appendChild(parent, anchor);
    const target = view('target');
    appendChild(parent, target);
    surface.appendChild(parent);
    surface.commit();
    expect(testIDs(fabric.appRoot().children)).toEqual(['parent', 'target']);

    // The production shape: an adapter appends under an anchor, and in the SAME task a native-event
    // write asks for its own targeted commit. `setNativeProps` is the reachable spelling of that;
    // `setNodePressed` reaches the identical path through `requestCommitFor`.
    appendChild(anchor, view('fresh'));
    setNativeProps(target, { opacity: 0.5 });
    await tick();

    // Asserted BEFORE any further commit. The general walk re-derives and would repair it, which is
    // exactly how this stayed invisible — so a `surface.commit()` here would delete the coverage.
    expect(testIDs(fabric.appRoot().children)).toEqual([
      'parent',
      'fresh',
      'target',
    ]);
  });

  it('control: the same edit made directly on the parent has always worked', async () => {
    // Proves the harness drives a real targeted commit rather than mounting nothing. This arm was
    // GREEN before the fix and green after — a probe whose two arms agree has not run the
    // experiment (`.claude/rules/test-harness-false-greens.md` §12), so it is the difference
    // between this arm and the one above that carries the finding.
    fabric.reset();
    const surface = createSurface(6104);
    const parent = view('parent');
    const target = view('target');
    appendChild(parent, target);
    surface.appendChild(parent);
    surface.commit();

    appendChild(parent, view('fresh'));
    setNativeProps(target, { opacity: 0.5 });
    await tick();

    expect(testIDs(fabric.appRoot().children)).toEqual([
      'parent',
      'target',
      'fresh',
    ]);
  });
});
