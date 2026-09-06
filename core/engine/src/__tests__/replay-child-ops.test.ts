// The renderable child list REPLAYED from the buffer's op log, checked against the tree it commits.
//
// `replayChildOps` (../commit.ts) exists so the walk stops re-deriving a list it already has, and
// item 5 widened it to parents holding SKIPPED children — an anchor or an empty raw text, which is
// every Vue `v-if`, every Svelte block and every Angular composed component host. Those parents'
// renderable list is not their desired list, and the ops are in desired space, so the replay splices
// each child's CONTRIBUTION rather than the child.
//
// ── WHY THIS FILE, BESIDE THE FUZZER AND THE COUNTER PROBE ──────────────────────────────────────
//
// The fuzzer (`commit-fuzz.test.ts`) runs the replay differential over generated programs and is the
// oracle that FINDS a divergence; it is not a place a reader can see what the rules are. The counter
// probe (`child-list-reuse.probe.test.ts`) prices the replay and asserts nothing about the tree. So
// the shapes below assert the OBSERVABLE — the order Fabric was actually handed — which is the thing
// an app depends on and the only one of the three oracles that survives a change to either of the
// others.
//
// Every case names whether it expects a REPLAY or a REFUSAL, and the tree must be right either way:
// a refusal is a performance verdict, never a correctness one, so a case that only asserted the
// verdict could not tell a correct refusal from a wrong list.
//
// ── THE BREAK LEDGER ────────────────────────────────────────────────────────────────────────────
//
// Every mechanism in the replay was broken on its own and the rows it reddens recorded, because two
// of them started out OVERLAPPING and the overlap made one unwitnessable
// (`.claude/rules/test-harness-false-greens.md` §20). Row sets are disjoint, which is what says
// none of these is standing behind another:
//
//   hidden.has(op.child)          3   this file's HIDES row, the probe's, and the fuzzer
//   hoists -> refuse              1   the HOISTED GRANDCHILD row, and nothing else reaches it
//   skipped `before` -> refuse    2   the childless-marker row, and the fuzzer
//   op.before ?? undefined        1   the NULL `before` row
//   clearPendingStructure         1   the detached-anchor drain row
//   child.committed = undefined   2   the off-tree anchor row, and the fuzzer
//
// Two things this ledger settled rather than assumed. A `before` the list does not hold used to
// REFUSE; it appends now, because refusing caught the skipped-`before` cases first and left that
// refusal green under its own break. And the caller carried a third precondition — every node the
// base hid still answers `isSkippedAtCommit` — which moved nothing when removed, because reaching
// that state takes an op naming the child and the first row above already refuses those.

import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  appendChild,
  createAnchor,
  createElement,
  createSurface,
  insertBefore,
  readCommitProfile,
  removeChild,
  setNodeComponent,
  setProp,
  type ISymbioteNode,
} from '../index';
// From the modules, not the barrel — neither is public API, and both are the point of the two rows
// at the bottom of this file.
import { hasPendingStructure } from '../edit-buffer';
import { ANCHOR_COMPONENT } from '../node';

const fabric = installFabric();

function view(testID: string): ISymbioteNode {
  const node = createElement('RCTView');
  setProp(node, 'testID', testID);
  return node;
}

/** The committed testIDs of one node's children, in order — what Fabric was handed. */
function committedOrder(testID: string): string[] {
  const flat: IFakeNode[] = [];
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      flat.push(node);
      walk(node.children);
    }
  };
  walk(fabric.committed);
  const parent = flat.find(node => node.props.testID === testID);
  if (parent === undefined) throw new Error(`no node committed for ${testID}`);
  return parent.children.map(child => String(child.props.testID));
}

describe('a parent holding a skipped child replays its ops', () => {
  it('inserts before a renderable sibling with a marker anchor in the list', () => {
    fabric.reset();
    const surface = createSurface(9401);
    const parent = view('parent');
    const a = view('a');
    const c = view('c');
    appendChild(parent, a);
    // A CHILDLESS anchor — Vue's `createComment`, Svelte's `ShimComment`, Solid's empty text. It
    // contributes nothing, so the renderable list is the desired list with a hole in it, which is
    // exactly the case 4b's precondition refused outright.
    appendChild(parent, createAnchor());
    appendChild(parent, c);
    surface.appendChild(parent);
    surface.commit();
    readCommitProfile();

    insertBefore(parent, view('b'), c);
    surface.commit();

    expect(committedOrder('parent')).toEqual(['a', 'b', 'c']);
    const profile = readCommitProfile();
    expect(
      profile.childListsReplayed,
      'the parent replayed rather than re-deriving',
    ).toBeGreaterThanOrEqual(1);
    expect(profile.childFlattens, 'and never reached the flatten').toBe(0);
  });

  it('appends past a HOISTING anchor, keeping the hoisted children in place', () => {
    fabric.reset();
    const surface = createSurface(9402);
    const parent = view('parent');
    appendChild(parent, view('a'));
    const anchor = createAnchor();
    appendChild(anchor, view('h1'));
    appendChild(anchor, view('h2'));
    appendChild(parent, anchor);
    surface.appendChild(parent);
    surface.commit();
    expect(committedOrder('parent')).toEqual(['a', 'h1', 'h2']);
    readCommitProfile();

    appendChild(parent, view('z'));
    surface.commit();

    expect(committedOrder('parent')).toEqual(['a', 'h1', 'h2', 'z']);
    expect(readCommitProfile().childFlattens, 'replayed, not flattened').toBe(
      0,
    );
  });

  it('treats a NULL `before` as an append, exactly as linkBefore does', () => {
    // `IEditOp.before` is typed `ISymbioteNode | undefined` and is not always one at runtime:
    // Solid's `insertNode` narrows its anchor on `!== undefined`, so a `null` anchor reaches
    // `insertBefore` and `linkBefore` reads it as an append (`indexOf(null)` is -1). The replay has
    // to answer identically.
    //
    // Cost of getting this wrong, measured 2026-09-06 while building item 5: the replay read
    // `op.before.component` and threw, the adapter's render guard swallowed the throw, and SIX Solid
    // suites reported a MISSING SUBTREE (`no RCTScrollView was committed`). Nothing in 30 red tests
    // named the engine.
    fabric.reset();
    const surface = createSurface(9403);
    const parent = view('parent');
    appendChild(parent, view('a'));
    // Present so the replay takes the skipped-child path, where the throw was.
    appendChild(parent, createAnchor());
    surface.appendChild(parent);
    surface.commit();

    insertBefore(parent, view('b'), null as unknown as ISymbioteNode);
    surface.commit();

    expect(committedOrder('parent')).toEqual(['a', 'b']);
  });
});

describe('and REFUSES the positions it cannot resolve — the tree is right either way', () => {
  it('re-derives when an op names a child the parent HIDES', () => {
    fabric.reset();
    const surface = createSurface(9404);
    const parent = view('parent');
    appendChild(parent, view('a'));
    const anchor = createAnchor();
    appendChild(anchor, view('h1'));
    appendChild(parent, anchor);
    appendChild(parent, view('z'));
    surface.appendChild(parent);
    surface.commit();
    expect(committedOrder('parent')).toEqual(['a', 'h1', 'z']);
    readCommitProfile();

    // The anchor's contribution is a BLOCK whose extent the replay does not hold, and recomputing it
    // is unsound: once the anchor is detached there is nothing left for an edit under it to poison.
    removeChild(parent, anchor);
    surface.commit();

    expect(committedOrder('parent')).toEqual(['a', 'z']);
    expect(
      readCommitProfile().childScans,
      'the parent went back to the derivation',
    ).toBeGreaterThanOrEqual(2);
  });

  it('re-derives when `before` names a childless marker, and still inserts in front of it', () => {
    fabric.reset();
    const surface = createSurface(9405);
    const parent = view('parent');
    appendChild(parent, view('a'));
    const marker = createAnchor();
    appendChild(parent, marker);
    appendChild(parent, view('z'));
    surface.appendChild(parent);
    surface.commit();
    readCommitProfile();

    // A marker paints nothing, so "before the marker" has no renderable position of its own. The
    // replay refuses and the derivation answers — `b` lands where the DESIRED list puts it, which is
    // in front of `z` rather than at the end.
    insertBefore(parent, view('b'), marker);
    surface.commit();

    expect(committedOrder('parent')).toEqual(['a', 'b', 'z']);
  });

  it('re-derives rather than positioning against a HOISTED grandchild', () => {
    // The refusal `hoists` exists for, and the only shape that reaches it. `h1` is in the parent's
    // RENDERABLE list and not in its desired one, so the two sides read one `before` differently:
    // `linkBefore` cannot find `h1` among the parent's children and APPENDS, while a replay looking
    // at the renderable list finds it at index 0 and would insert in front of everything.
    //
    // FOUND BY THE FUZZER, ORACLE 1, before the refusal was per-parent — a per-op check cannot see
    // it, because neither node in the op is skipped. The ANCHOR is, and it is not in the op.
    fabric.reset();
    const surface = createSurface(9407);
    const parent = view('parent');
    const anchor = createAnchor();
    const h1 = view('h1');
    appendChild(anchor, h1);
    appendChild(parent, anchor);
    appendChild(parent, view('z'));
    surface.appendChild(parent);
    surface.commit();
    expect(committedOrder('parent')).toEqual(['h1', 'z']);

    insertBefore(parent, view('b'), h1);
    surface.commit();

    // The desired list is [anchor, z, b] — `linkBefore` appended — so `b` lands LAST, not first.
    expect(committedOrder('parent')).toEqual(['h1', 'z', 'b']);
  });

  it('re-derives when the parent HOISTS and an op carries a `before`', () => {
    fabric.reset();
    const surface = createSurface(9406);
    const parent = view('parent');
    const anchor = createAnchor();
    appendChild(anchor, view('h1'));
    appendChild(parent, anchor);
    const z = view('z');
    appendChild(parent, z);
    surface.appendChild(parent);
    surface.commit();
    expect(committedOrder('parent')).toEqual(['h1', 'z']);
    readCommitProfile();

    // `h1` IS in the renderable list and is NOT in the desired one, so a `before` found there could
    // be a grandchild the mutation side would have appended past. The replay cannot tell the two
    // apart and refuses; the derivation puts `b` in front of `z`.
    insertBefore(parent, view('b'), z);
    surface.commit();

    expect(committedOrder('parent')).toEqual(['h1', 'b', 'z']);
  });
});

describe('and still does what the FLATTEN did to the children it hides', () => {
  // `renderableChildren` drains three things from every skipped child it drops, and each has its own
  // reason written at that loop. A replayed list reaches none of them, so the replay path owes the
  // same three — and the two below are the ones no other test in the repo would notice.

  it('drains the op log of an anchor built while DETACHED and then appended', () => {
    // An edit under an ATTACHED anchor poisons this parent and sends it to the derivation, which
    // drains. An anchor populated BEFORE it is attached carries its ops in with it, and the parent
    // replays — so nothing else would ever consume them. Angular mounts one anchor per composed
    // component, so this is an unbounded array per component instance, for the life of the process.
    fabric.reset();
    const surface = createSurface(9408);
    const parent = view('parent');
    appendChild(parent, view('a'));
    surface.appendChild(parent);
    surface.commit();

    const anchor = createAnchor();
    appendChild(anchor, view('h1'));
    appendChild(anchor, view('h2'));
    expect(
      hasPendingStructure(anchor),
      'the anchor arrives carrying its own ops',
    ).toBe(true);

    appendChild(parent, anchor);
    surface.commit();

    expect(committedOrder('parent')).toEqual(['a', 'h1', 'h2']);
    expect(
      hasPendingStructure(anchor),
      'and the commit that hid it consumed them',
    ).toBe(false);
  });

  it('drops the committed record of a node that becomes an anchor off-tree', () => {
    // The `skipped-node-family` hazard reached through the replay instead of the flatten. A skipped
    // node keeps a committed handle whose Fabric FAMILY belongs to its parent's previous Fabric
    // node; when the parent is later re-created the skipped child is never visited and never told,
    // so on coming back it reads `committed.parent === renderableParent`, takes the UPDATE path and
    // adopts the orphaned handle. Fabric refuses that in C++ — a native abort, not a misrender.
    fabric.reset();
    const surface = createSurface(9409);
    const from = view('from');
    const to = view('to');
    const parent = view('parent');
    const flipper = view('flipper');
    appendChild(parent, flipper);
    appendChild(from, parent);
    surface.appendChild(from);
    surface.appendChild(to);
    surface.commit();

    // 1. It becomes an anchor OFF-TREE, so `markPresenceIfFlipped` finds no parent to poison and
    //    the parent replays rather than flattening.
    removeChild(parent, flipper);
    setNodeComponent(flipper, ANCHOR_COMPONENT);
    appendChild(parent, flipper);
    surface.commit();

    // 2. The parent moves, which re-creates its Fabric node and orphans every family under it.
    removeChild(from, parent);
    appendChild(to, parent);
    surface.commit();

    // 3. And it comes back. Without the record drop this throws from the slot's family check.
    setNodeComponent(flipper, 'RCTView');
    surface.commit();

    expect(committedOrder('parent')).toEqual(['flipper']);
  });
});
