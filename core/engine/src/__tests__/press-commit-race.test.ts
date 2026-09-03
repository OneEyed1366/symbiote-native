// The device regression reported 2026-08-24: the FIRST press changes nothing visually while its
// callback fires, and every press after it works. Tier-2 made a press ask the engine for a commit
// of its own (`requestCommitFor`), which lands in the same tick as the framework's own update — so
// the suspicion is that one of the two commits swallows the other.
//
// Written as a race rather than as a single press because the single-press case already passes
// (`core/components/src/behaviors/pressable.test.ts`), so whatever is lost is lost only when both
// commits are in flight.
import { afterEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  appendChild,
  clearGlobalStyles,
  createElement,
  createSurface,
  registerRules,
  requestCommitFor,
  routeProp,
  setNodePressed,
  type ISymbioteNode,
} from '../index';

const fabric = installFabric();
let nextRootTag = 7900;

function committedPropsOf(testID: string): Record<string, unknown> | undefined {
  const walk = (nodes: readonly IFakeNode[]) => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node.props;
      const hit = walk(node.children);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  return walk(fabric.appRoot().children);
}

const PRESSED_RULES = [
  {
    tokens: ['btn'],
    specificity: [0, 1, 0] as [number, number, number],
    order: 0,
    style: { opacity: 1 },
  },
  {
    tokens: ['btn', ':active'],
    specificity: [0, 2, 0] as [number, number, number],
    order: 1,
    style: { opacity: 0.6 },
  },
];

function mountTree() {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  const button = createElement('RCTView');
  const sibling = createElement('RCTView');
  routeProp(button, 'class', 'btn');
  routeProp(button, 'testID', 'button');
  routeProp(sibling, 'testID', 'sibling');
  routeProp(sibling, 'accessibilityLabel', 'before');
  appendChild(root, button);
  appendChild(root, sibling);
  surface.appendChild(root);
  surface.commit();
  return { surface, button, sibling };
}

// What the host behavior does, spelled out here rather than imported: `setNodePressed` only
// DIRTIES, and a press arrives outside every renderer mutation path, so nothing schedules a commit
// unless the behavior asks. A probe that calls only the first half reads as a dead mechanism — the
// exact false RED this suite exists to distinguish from a real one.
function press(node: ISymbioteNode, pressed: boolean): void {
  setNodePressed(node, pressed);
  requestCommitFor(node);
}

afterEach(() => {
  clearGlobalStyles();
});

describe('a press commit racing the framework commit', () => {
  it('publishes the pressed style when the framework commits FIRST in the same tick', async () => {
    registerRules(PRESSED_RULES);
    const { surface, button, sibling } = mountTree();

    // Native event: the press dirties the node and queues its own commit.
    press(button, true);
    // The app's own onPress handler, same tick: a prop somewhere else, then the framework commits.
    routeProp(sibling, 'accessibilityLabel', 'after');
    surface.commit();
    // ...and only now the queued microtask runs.
    await Promise.resolve();

    expect(committedPropsOf('sibling')?.accessibilityLabel).toBe('after');
    expect(committedPropsOf('button')?.opacity).toBe(0.6);
  });

  it('publishes the framework update when the press commit lands FIRST', async () => {
    registerRules(PRESSED_RULES);
    const { surface, button, sibling } = mountTree();

    press(button, true);
    await Promise.resolve();
    routeProp(sibling, 'accessibilityLabel', 'after');
    surface.commit();

    expect(committedPropsOf('button')?.opacity).toBe(0.6);
    expect(committedPropsOf('sibling')?.accessibilityLabel).toBe('after');
  });

  // THE CASE THE THREE ABOVE MISS, and the one a peer reproduced headlessly: they all update a
  // SIBLING after the press. The report is that the PRESSED node itself stops committing — for
  // ordinary updates too, forever after its first press. Engine-node props stay correct; only the
  // commit is lost.
  it('keeps committing the pressed node itself after its first press', async () => {
    registerRules(PRESSED_RULES);
    const { surface, button } = mountTree();

    // Observable control BEFORE the press: without it a later empty read cannot be told apart from
    // a tree that never committed at all.
    routeProp(button, 'accessibilityLabel', 'before');
    surface.commit();
    expect(committedPropsOf('button')?.accessibilityLabel).toBe('before');

    press(button, true);
    await Promise.resolve();

    routeProp(button, 'accessibilityLabel', 'after');
    surface.commit();
    expect(committedPropsOf('button')?.accessibilityLabel).toBe('after');
  });

  // The SAME case again, but committed the way a fine-grained adapter does it: `requestCommit()`
  // (coalesced, its own microtask) rather than the synchronous `commit()` React uses. Both are
  // engine API and a press has to survive either — and only one of them was covered.
  it('keeps committing the pressed node through the COALESCED commit path', async () => {
    registerRules(PRESSED_RULES);
    const { surface, button } = mountTree();

    routeProp(button, 'accessibilityLabel', 'before');
    surface.requestCommit();
    await Promise.resolve();
    expect(committedPropsOf('button')?.accessibilityLabel).toBe('before');

    press(button, true);
    await Promise.resolve();

    routeProp(button, 'accessibilityLabel', 'after');
    surface.requestCommit();
    await Promise.resolve();
    expect(committedPropsOf('button')?.accessibilityLabel).toBe('after');
  });

  // THE ONE THE FIVE ABOVE MISS. They all update the pressed node ITSELF, and a peer's flag dump
  // showed the casualty is its DESCENDANT, updated in the same tick:
  //
  //   1. the press dirties the pressable, and markDirty walks UP marking the chain
  //   2. same tick, the framework dirties a CHILD — markDirty walks up, meets the pressable
  //      already dirty, and stops there, which is its documented fast path
  //   3. the microtask runs commitTargeted([pressable]): it publishes the pressable's props and
  //      clears its flags, and by design it never descends
  //   4. the framework's own commit reconciles from the root, finds a clean chain, and skips
  //   5. the child is left dirty under a clean chain — unreachable, forever
  //
  // Vue and Solid survive only because their schedulers rewrite the prop on the node itself and
  // re-dirty the chain. That is a property of those schedulers, not of this contract, so the fix
  // must not depend on it.
  it('does not orphan a dirty DESCENDANT dirtied in the same tick as the press', async () => {
    registerRules(PRESSED_RULES);
    const surface = createSurface((nextRootTag += 1));
    const root = createElement('RCTView');
    const button = createElement('RCTView');
    const label = createElement('RCTView');
    routeProp(button, 'class', 'btn');
    routeProp(button, 'testID', 'button');
    routeProp(label, 'testID', 'label');
    routeProp(label, 'accessibilityLabel', 'before');
    appendChild(button, label);
    appendChild(root, button);
    surface.appendChild(root);
    surface.commit();
    expect(committedPropsOf('label')?.accessibilityLabel).toBe('before');

    press(button, true);
    routeProp(label, 'accessibilityLabel', 'after');
    surface.requestCommit();
    await Promise.resolve();
    await Promise.resolve();

    expect(committedPropsOf('label')?.accessibilityLabel).toBe('after');
    // And the node must not be stranded for every LATER update either.
    routeProp(label, 'accessibilityLabel', 'later');
    surface.requestCommit();
    await Promise.resolve();
    expect(committedPropsOf('label')?.accessibilityLabel).toBe('later');
  });

  // The reported shape exactly: press, release, press again. If the first cycle is lost and the
  // second works, this is where it shows.
  it('survives two press cycles with a framework commit interleaved', async () => {
    registerRules(PRESSED_RULES);
    const { surface, button, sibling } = mountTree();

    for (const label of ['first', 'second']) {
      press(button, true);
      routeProp(sibling, 'accessibilityLabel', label);
      surface.commit();
      await Promise.resolve();
      expect(committedPropsOf('button')?.opacity, `${label} press-in`).toBe(
        0.6,
      );

      press(button, false);
      await Promise.resolve();
      expect(committedPropsOf('button')?.opacity, `${label} release`).toBe(1);
    }
  });
});
