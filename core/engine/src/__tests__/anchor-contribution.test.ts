// An anchor's contribution to its parent's renderable list, served from its OWN record.
//
// Item 5 made a parent holding anchors replay instead of re-deriving, and left one desired-tree read
// standing: `flattenPure(anchor)`, once per anchor per commit, to learn what the anchor puts in its
// parent's place. On the shape Angular emits — one anchor per composed component — that was a
// thousand `childrenOf` calls on a thousand-row create, and it was the whole residual.
//
// `flattenContribution` (../commit.ts) closes it. An anchor is an ordinary participant in the edit
// buffer: it has an op log, and every edit that can change what it contributes marks that log. So its
// contribution REPLAYS from a record it published last commit — `IContribution` (../node.ts), the
// mirror's twin for the one node the mirror cannot hold, because an anchor has no Fabric handle.
//
// MEASURED at the tree.ts seam, 1 000 rows with one hoisting anchor each:
//
//                            item 5   this
//   childrenOf() calls         1004      4     the four are the container's entry bookkeeping
//   childScans                 1001      1     the one is the container
//
// The commit now reads no desired child list on ANY shape — flat or anchored, create or append.
//
// ── WHY THIS FILE ───────────────────────────────────────────────────────────────────────────────
//
// Same division as `replay-child-ops.test.ts`, for the same reason: the fuzzer FINDS a divergence and
// cannot say what the rules are; the counter probe prices the change and asserts nothing about the
// tree. These cases assert the OBSERVABLE — the order Fabric was handed — so a wrong record is a
// wrong tree here, not a wrong number.
//
// ── THE BREAK LEDGER ────────────────────────────────────────────────────────────────────────────
//
// Each mechanism broken on its own, row sets disjoint (`.claude/rules/test-harness-false-greens.md`
// §20):
//
//   contributionsInFlight guard      1   the CYCLE row — and it is a crash, not a wrong list
//   node.contributed = undefined     1   the FLIP row (node.ts, markPresenceIfFlipped)
//   on un-skip
//   node.contributed = undefined     1   the FLIP row (node.ts, markPresenceIfFlipped)
//   on un-skip
//   the `committed === undefined`    1   the EX-REAL row. Its ORDER against `hideSkippedChild` is
//   arm of `replayable`                  the same mechanism seen from the other side — that helper
//                                        clears the field the arm reads — and breaking either
//                                        reddens this one row, which is why they are one entry.
//
// `publishContribution`'s drain is deliberately NOT in this list, and finding out why is worth more
// than the row would have been. It was written with a case asserting that a log replayed twice
// duplicates its effect. It does not: the replay REMOVES a child by identity before re-inserting it,
// so an append replayed twice lands in the same place. The drain earns its keep against the LEAK
// instead — an unreconciled node accumulating ops for the life of the process — and that is asserted
// by `edit-buffer.test.ts`'s "truncates a SKIPPED node log at every commit that drops it", which
// goes red when the drain is removed. The row below is kept as a correctness case, not as a witness.
//
// The cycle row is the one worth reading before touching any of this. An op log names nodes by
// IDENTITY and goes on naming them after they move, so two anchors can each hold a log naming the
// other while the desired tree is perfectly acyclic. `flattenPure` cannot hit that because it walks
// `childrenOf`; a log-walk can, and does. Found by the fuzzer on the first deep run of this change.

import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  appendChild,
  createAnchor,
  createElement,
  createSurface,
  readCommitProfile,
  removeChild,
  setNodeComponent,
  setProp,
  type ISymbioteNode,
} from '../index';
import { ANCHOR_COMPONENT } from '../node';

const fabric = installFabric();

function view(testID: string): ISymbioteNode {
  const node = createElement('RCTView');
  setProp(node, 'testID', testID);
  return node;
}

function firstChildOf(node: ISymbioteNode): ISymbioteNode {
  const child = node.children[0];
  if (child === undefined) throw new Error('no first child');
  return child;
}

/** The committed testIDs of one node's children, in order — what Fabric was actually handed. */
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

describe("an anchor's contribution comes off its record", () => {
  it('replays a nested anchor without reading either anchor’s children', () => {
    fabric.reset();
    readCommitProfile();
    const surface = createSurface(9601);
    const parent = view('parent');
    const outer = createAnchor();
    const inner = createAnchor();
    appendChild(inner, view('deep'));
    appendChild(outer, inner);
    appendChild(parent, view('a'));
    appendChild(parent, outer);
    surface.appendChild(parent);
    surface.commit();

    expect(committedOrder('parent')).toEqual(['a', 'deep']);
    const created = readCommitProfile();
    // A create: neither anchor has a record yet, but each has a COMPLETE log (`recordNewNode` seeds
    // it empty), so both replay from empty and neither reads a child list. That is the property the
    // create path needs and the one the counters state.
    expect(created.contributionsDerived, 'nothing had to be derived').toBe(0);
    expect(created.contributionsReplayed, 'both anchors replayed').toBe(2);
    expect(created.childFlattens, 'the flatten never ran').toBe(0);

    // A second commit that changes the parent's list but nothing under either anchor: the anchors are
    // untouched, so their records answer with no work at all.
    appendChild(parent, view('z'));
    surface.commit();
    expect(committedOrder('parent')).toEqual(['a', 'deep', 'z']);
    const appended = readCommitProfile();
    expect(appended.contributionsDerived, 'still nothing derived').toBe(0);
  });

  it('re-derives when an edit lands under the anchor, and only then', () => {
    fabric.reset();
    const surface = createSurface(9602);
    const parent = view('parent');
    const anchor = createAnchor();
    appendChild(anchor, view('h1'));
    appendChild(parent, anchor);
    surface.appendChild(parent);
    surface.commit();
    readCommitProfile();

    // An op ON the anchor. `markChildOp` records it against the anchor's own log and
    // `markRenderableAncestor` poisons the parent above it, so the parent re-derives — and the
    // anchor REPLAYS its own log onto the record it published, which is the whole point.
    appendChild(anchor, view('h2'));
    surface.commit();

    expect(committedOrder('parent')).toEqual(['h1', 'h2']);
    const profile = readCommitProfile();
    expect(profile.contributionsReplayed, 'the anchor replayed').toBe(1);
    expect(profile.contributionsDerived, 'and did not derive').toBe(0);
  });

  it('CYCLE — two anchors whose logs name each other while the tree stays acyclic', () => {
    fabric.reset();
    const surface = createSurface(9603);
    const host = view('host');
    surface.appendChild(host);
    const a = createAnchor();
    const b = createAnchor();
    // b's log gains `+a`; then a leaves b, which appends `-a` to b's log; then b moves under a, so
    // a's log gains `+b`. Final tree is host > a > b — acyclic — and the two logs reference each
    // other. Resolving one through the other's log never terminates, and `flattenPure` is the way
    // out because it walks the tree rather than the logs.
    appendChild(b, a);
    appendChild(host, a);
    appendChild(a, b);

    expect(() => surface.commit()).not.toThrow();
    // The tree is the assertion, not merely the absence of a crash: an anchor contributing nothing
    // must leave the parent with nothing, and a guard that returned a wrong list would pass a
    // "did not throw" check.
    expect(committedOrder('host')).toEqual([]);
  });

  it('FLIP — a record published while skipped is dropped when the node comes back', () => {
    fabric.reset();
    const surface = createSurface(9604);
    const parent = view('parent');
    const flipper = createAnchor();
    appendChild(flipper, view('first'));
    appendChild(parent, flipper);
    surface.appendChild(parent);
    surface.commit();
    // Hoisted: the anchor published a record naming `first`.
    expect(committedOrder('parent')).toEqual(['first']);

    // It becomes a real view, AND ITS CHILDREN CHANGE while it is one. That second half is what
    // makes the record stale rather than merely old — a flip that leaves the children alone leaves a
    // record that still happens to be right, and a row written that way witnesses nothing.
    setProp(flipper, 'testID', 'flipper');
    setNodeComponent(flipper, 'RCTView');
    surface.commit();
    expect(committedOrder('parent')).toEqual(['flipper']);
    removeChild(flipper, firstChildOf(flipper));
    appendChild(flipper, view('other'));
    surface.commit();
    expect(committedOrder('flipper')).toEqual(['other']);

    // And back, with NO op of its own this cycle — so the record, if it survived, is returned
    // verbatim. It names `first`, which has not been in this node for two commits.
    setNodeComponent(flipper, ANCHOR_COMPONENT);
    surface.commit();
    expect(committedOrder('parent')).toEqual(['other']);
  });

  it('EX-REAL — a node that last committed as a real one derives instead of replaying from empty', () => {
    fabric.reset();
    const surface = createSurface(9605);
    const parent = view('parent');
    const node = view('node');
    appendChild(node, view('kid'));
    appendChild(parent, node);
    surface.appendChild(parent);
    surface.commit();
    // Read and discard: the profile ACCUMULATES until read, so without this the assertion below
    // would be measuring every commit in this file that came before it.
    readCommitProfile();

    // A LIVE op log and a committed record at once, which is the state the `committed === undefined`
    // arm exists to separate. Its log was drained by its own reconcile, so `[+extra]` is not its
    // history — replaying it from an empty base says the node contributes only `extra` and drops
    // `kid` from the tree. Without the `extra` this row cannot fail: a node with no op at all has an
    // empty log, which is refused by the other arm and never reaches the discriminator.
    appendChild(node, view('extra'));
    setNodeComponent(node, ANCHOR_COMPONENT);
    surface.commit();

    expect(committedOrder('parent')).toEqual(['kid', 'extra']);
    const profile = readCommitProfile();
    expect(profile.contributionsDerived, 'it derived').toBe(1);
  });

  it('an anchor gains children across commits without duplicating what it already contributed', () => {
    fabric.reset();
    const surface = createSurface(9606);
    const parent = view('parent');
    const anchor = createAnchor();
    appendChild(parent, anchor);
    surface.appendChild(parent);
    surface.commit();

    appendChild(anchor, view('one'));
    surface.commit();
    expect(committedOrder('parent')).toEqual(['one']);

    // The second commit's base already carries `one`. If `publishContribution` did not consume the
    // log, this replay would splice it in again and the parent would commit ['one', 'one', 'two'].
    appendChild(anchor, view('two'));
    surface.commit();
    expect(committedOrder('parent')).toEqual(['one', 'two']);

    // And a commit that changes nothing under the anchor must not disturb it either.
    appendChild(parent, view('tail'));
    surface.commit();
    expect(committedOrder('parent')).toEqual(['one', 'two', 'tail']);
  });

  it('a removed anchor takes its contribution out of the parent', () => {
    fabric.reset();
    const surface = createSurface(9607);
    const parent = view('parent');
    const anchor = createAnchor();
    appendChild(anchor, view('h1'));
    appendChild(parent, view('a'));
    appendChild(parent, anchor);
    appendChild(parent, view('b'));
    surface.appendChild(parent);
    surface.commit();
    expect(committedOrder('parent')).toEqual(['a', 'h1', 'b']);

    removeChild(parent, anchor);
    surface.commit();
    expect(committedOrder('parent')).toEqual(['a', 'b']);
  });
});
