// A subtree removed before it ever committed, and re-attached after a commit, must come back WHOLE.
//
// The property is invisible today and becomes load-bearing the moment `node.children` goes: right
// now the desired list is a field that survives anything, so nothing the buffer does to a detached
// node can lose structure. Once the desired list is derived from (committed record + op log), a node
// that has NEVER committed has its op log as its ONLY structure — and `sweepDroppedEdits` was
// deleting exactly those logs, because a never-committed discarded node is the one thing that sweep
// existed to reclaim (`symbiote-fabric-cxx-surface` §8, 4c).
//
// So this row is written BEFORE the switch, against the field, so that it is a guard rather than a
// description: it passed on the field, and it must go on passing on the derivation.
//
// Frameworks do park subtrees — Svelte parks live ones across commits, Solid spells a move as
// remove-then-reinsert — so this is a shape adapters emit, not a fuzzer curiosity. The
// never-committed variant is the sharp one because it is the only case with nowhere else to look.

import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  removeChild,
  setProp,
  type ISymbioteNode,
} from '../index';
import { setReplayVerification } from '../commit';
import { pendingChildOps } from '../edit-buffer';

const fabric = installFabric();
// On, though it CANNOT witness this particular loss and saying so is the point. `verifyDesired`
// compares the derivation against `node.children`, and for a parked node the derivation falls back
// to `childrenOf` exactly where the loss would be — the node was not reconciled while detached, so
// there is no op log left to replay and the fallback reads the field. The differential is on because
// it is free and catches everything else; the assertion that actually pins parking is the op-log one
// below, which was RED before the buffer stopped discarding a detached node's structure.
setReplayVerification(true);

function view(testID: string): ISymbioteNode {
  const node = createElement('RCTView');
  setProp(node, 'testID', testID);
  return node;
}

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

describe('a subtree parked across a commit comes back whole', () => {
  it('when it had NEVER committed — its op log is its only structure', () => {
    fabric.reset();
    const surface = createSurface(9701);
    const host = view('host');
    surface.appendChild(host);

    const parked = view('parked');
    appendChild(parked, view('kid-a'));
    appendChild(parked, view('kid-b'));
    appendChild(host, parked);
    // Out again before anything commits, so Fabric has never seen one node of it.
    removeChild(host, parked);

    surface.commit();
    expect(committedOrder('host')).toEqual([]);

    // THE DECIDING ASSERTION, and it is about the buffer rather than about what commits — because
    // the committed output is correct either way while `node.children` is still a field. This node
    // has never committed, so its op log is the only place its two children exist; a buffer that
    // discards a detached node's structure leaves nothing for the switch to derive from.
    expect(pendingChildOps(parked)?.filter(op => !op.remove)).toHaveLength(2);

    // And back. Nothing re-appends the children — the framework re-attaches the ROOT and expects
    // its subtree to have survived, which is the whole point of parking.
    appendChild(host, parked);
    surface.commit();

    expect(committedOrder('host')).toEqual(['parked']);
    expect(committedOrder('parked')).toEqual(['kid-a', 'kid-b']);
  });

  it('when it HAD committed, and gained a child while detached', () => {
    fabric.reset();
    const surface = createSurface(9702);
    const host = view('host');
    const parked = view('parked');
    appendChild(parked, view('kid-a'));
    appendChild(host, parked);
    surface.appendChild(host);
    surface.commit();
    expect(committedOrder('parked')).toEqual(['kid-a']);

    removeChild(host, parked);
    surface.commit();
    expect(committedOrder('host')).toEqual([]);

    // Edited WHILE detached — the commit above never visited it, so the op recording this child is
    // still pending when the node comes back.
    appendChild(parked, view('kid-b'));
    appendChild(host, parked);
    surface.commit();

    expect(committedOrder('parked')).toEqual(['kid-a', 'kid-b']);
  });
});
