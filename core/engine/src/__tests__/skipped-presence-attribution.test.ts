// A node whose SKIPPED-ness flips changes its renderable parent's child list, and the record has to
// say so — the third and fourth members of the family `anchor-structure-attribution.test.ts` opened.
//
// `renderableChildren` (commit.ts) drops two kinds of node: an anchor, and a raw text whose content
// is the empty string (`isSkippedAtCommit`). Whether a node is dropped is therefore decided by
// `node.component` and, for a raw text, by `node.props.text` — and BOTH are writable after the node
// has committed:
//
//   setText(raw, '')          the node was in its parent's renderable list and now is not
//   setText(raw, 'x')         it was not and now is
//   setNodeComponent(...)     the same flip, through the component name instead
//
// Neither write touches any parent's child list, so neither used to record a structural edit
// anywhere. `markStructureDirty` was never called and `hasPendingStructure(parent)` stayed false.
//
// FOUND 2026-09-05 by ENUMERATION rather than by a failure, which is the point of the exercise:
// `symbiote-fabric-cxx-surface` §8 states the property the buffer drain rests on — that
// `hasPendingStructure(node)` is true whenever that node's renderable child list could differ from
// its committed snapshot — and asks for the rest of the family to be ruled out BEFORE the
// incremental derivation is built. Asking "what else does `isSkippedAtCommit` consult" produces
// exactly these two, and both were live.
//
// WHY IT IS QUIET, and it is the same mechanism as the anchor case: the general commit re-derives
// `renderableChildren` on every node it visits, and a prop write bubbles `pendingPath` through the
// parent, so the parent IS visited and repairs itself. Only a path that trusts the snapshot can see
// it — today that is `commitTargeted`, tomorrow it is the drain.
//
// The three blocks fail differently on purpose. The first two are about the RECORD and fail as a
// boolean; the third is about the COMMITTED TREE and fails as an empty `RCTRawText` reaching Fabric,
// which on a device is a native abort inside the text walk rather than a misrender (see
// `isEmptyRawText`, node.ts).

import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  setNativeProps,
  setNodeComponent,
  setProp,
  setText,
} from '../index';
import { TEXT_COMPONENT } from '../node';
import { hasPendingStructure } from '../edit-buffer';

const fabric = installFabric();

function viewNames(nodes: readonly IFakeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly IFakeNode[]): void => {
    for (const node of list) {
      out.push(node.viewName);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

describe('an emptiness flip on a raw text records against its parent', () => {
  it('records when the text becomes EMPTY and the node leaves the list', () => {
    const surface = createSurface(6201);
    const text = createElement(TEXT_COMPONENT, true);
    const raw = createRawText('hello');
    appendChild(text, raw);
    surface.appendChild(text);
    surface.commit();
    // The control: after a commit nothing is pending, so a `true` below belongs to the write and
    // not to a buffer that never drained.
    expect(hasPendingStructure(text)).toBe(false);

    setText(raw, '');

    expect(hasPendingStructure(text)).toBe(true);
  });

  it('records when the text becomes NON-empty and the node comes back', () => {
    // The reverse direction, and it is the one a check written on the post-write state alone
    // misses: after this write the node is not skipped, so "is this node skipped now" answers no
    // and attributes nothing. Only comparing BEFORE against AFTER catches both.
    const surface = createSurface(6202);
    const text = createElement(TEXT_COMPONENT, true);
    const raw = createRawText('');
    appendChild(text, raw);
    surface.appendChild(text);
    surface.commit();
    expect(hasPendingStructure(text)).toBe(false);

    setText(raw, 'back');

    expect(hasPendingStructure(text)).toBe(true);
  });

  it('does NOT record when the text changes but the emptiness does not', () => {
    // The negative control, and it is what keeps the fix from degenerating into "every setText is a
    // structural edit" — which would pass both rows above while removing the whole saving the
    // record exists for.
    const surface = createSurface(6203);
    const text = createElement(TEXT_COMPONENT, true);
    const raw = createRawText('hello');
    appendChild(text, raw);
    surface.appendChild(text);
    surface.commit();

    setText(raw, 'goodbye');

    expect(hasPendingStructure(text)).toBe(false);
  });
});

describe('a component swap that flips skipped-ness records against its parent', () => {
  it('records when an empty raw text stops being a raw text', () => {
    const surface = createSurface(6204);
    const parent = createElement(TEXT_COMPONENT, true);
    const child = createRawText('');
    appendChild(parent, child);
    surface.appendChild(parent);
    surface.commit();
    expect(hasPendingStructure(parent)).toBe(false);

    // The node was skipped for its EMPTINESS and stops being skipped because its COMPONENT moved,
    // with `props.text` never written — so this reaches the flip through the other half of
    // `isSkippedAtCommit`. `setNodeComponent` is a real engine entry point: `resolveIntrinsicTag`
    // drives it for the TextInput single/multiline swap.
    setNodeComponent(child, 'RCTView');

    expect(hasPendingStructure(parent)).toBe(true);
  });

  it('the ENGINE-side predicate is the one the commit walk uses', () => {
    // `node.ts` carries its own copy of `isSkippedAtCommit` (importing commit.ts from there would
    // close a cycle), so the two can drift and the drift is silent: the copy decides what gets
    // RECORDED and the original decides what gets COMMITTED, and a node dropped by one and not the
    // other is a node that stops reaching Fabric with nothing red. Pinned by behaviour rather than
    // by reading either function — an anchor and an empty raw text must both be absent from the
    // committed tree AND must both make their parent structurally pending.
    fabric.reset();
    const surface = createSurface(6208);
    const parent = createElement(TEXT_COMPONENT, true);
    const raw = createRawText('x');
    appendChild(parent, raw);
    surface.appendChild(parent);
    surface.commit();
    expect(viewNames(fabric.appRoot().children)).toEqual([
      'RCTText',
      'RCTRawText',
    ]);

    setText(raw, '');
    expect(hasPendingStructure(parent)).toBe(true);
    surface.commit();

    expect(viewNames(fabric.appRoot().children)).toEqual(['RCTText']);
  });

  it('does NOT record for a swap between two live components', () => {
    const surface = createSurface(6205);
    const parent = createElement('RCTView');
    const child = createElement('RCTView');
    appendChild(parent, child);
    surface.appendChild(parent);
    surface.commit();

    setNodeComponent(child, 'RCTImageView');

    expect(hasPendingStructure(parent)).toBe(false);
  });
});

// WHAT THE TARGETED PATH DOES AND DOES NOT PROMISE, because the first version of this block asserted
// the wrong thing and the difference is worth stating once.
//
// `commitTargeted` rebuilds ONLY the ancestor chains of its own writes. A structural change in an
// unrelated sibling subtree is therefore not published by that commit at all — and that is correct
// rather than a hole: the change stays pending, Fabric keeps holding the previous, entirely
// consistent version of that subtree, and the next general commit publishes it. The tree is never
// wrong, only one commit old in a place nothing asked about.
//
// What the fix has to buy is the case where the flipped node IS under a write's ancestor, because
// there `commitTargeted` rebuilds the child set from `record.children` — a snapshot that still
// names the node. Before the fix nothing recorded the flip, so the ancestor read as clean and the
// snapshot was trusted; now it bails to the general path, which re-derives.
describe('a targeted commit does not trust a stale snapshot after a flip', () => {
  it('drops an emptied raw text in the SAME flush, not one commit later', async () => {
    fabric.reset();
    const surface = createSurface(6206);
    const text = createElement(TEXT_COMPONENT, true);
    const raw = createRawText('hello');
    appendChild(text, raw);
    // A sibling INSIDE the same Text, so the write's ancestor chain runs through the node whose
    // renderable child list the flip changes. That is the whole point of the arrangement.
    const target = createElement(TEXT_COMPONENT, true);
    setProp(target, 'testID', 'target');
    appendChild(text, target);
    surface.appendChild(text);
    surface.commit();
    expect(viewNames(fabric.appRoot().children)).toEqual([
      'RCTText',
      'RCTRawText',
      'RCTVirtualText',
    ]);

    // The production shape: a label is cleared, and in the SAME task a native-event write asks for
    // its own targeted commit.
    setText(raw, '');
    setNativeProps(target, { opacity: 0.5 });
    await tick();

    // Asserted BEFORE any further commit: the general walk re-derives and would repair it, which is
    // exactly how this stayed invisible, so a `surface.commit()` here would delete the coverage.
    expect(viewNames(fabric.appRoot().children)).toEqual([
      'RCTText',
      'RCTVirtualText',
    ]);
  });

  it('control: a non-emptying text write has always been safe', async () => {
    // Proves the harness drives a real targeted commit rather than mounting nothing. GREEN before
    // the fix and after — it is the DIFFERENCE between this arm and the one above that carries the
    // finding (`.claude/rules/test-harness-false-greens.md` §12).
    fabric.reset();
    const surface = createSurface(6207);
    const text = createElement(TEXT_COMPONENT, true);
    const raw = createRawText('hello');
    appendChild(text, raw);
    const target = createElement(TEXT_COMPONENT, true);
    setProp(target, 'testID', 'target');
    appendChild(text, target);
    surface.appendChild(text);
    surface.commit();

    setText(raw, 'still here');
    setNativeProps(target, { opacity: 0.5 });
    await tick();

    expect(viewNames(fabric.appRoot().children)).toEqual([
      'RCTText',
      'RCTRawText',
      'RCTVirtualText',
    ]);
  });
});
